import { BadRequestException } from '@nestjs/common';
import { MerchantPanelService } from './merchant-panel.service';
import { MerchantPanelAccessGroupsService } from './merchant-panel-access-groups.service';
import { MerchantPanelOutletsService } from './merchant-panel-outlets.service';
import { MerchantPanelCashierService } from './merchant-panel-cashier.service';
import type { MerchantsService } from '../merchants/merchants.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { LookupCacheService } from '../../core/cache/lookup-cache.service';
import type { UpsertOutletPayload } from './merchant-panel.service';
import {
  StaffStatus,
  StaffRole,
  AccessScope,
  StaffOutletAccessStatus,
} from '@prisma/client';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type StaffAccess = {
  id: string;
  outletId: string;
  outlet: { name: string };
  pinCode: string | null;
  status: StaffOutletAccessStatus;
  lastTxnAt: Date | null;
};
type StaffMembership = {
  groupId: string;
  group: { id: string; name: string; scope: AccessScope };
};
type StaffMember = {
  id: string;
  login: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  position: string | null;
  comment: string | null;
  role: StaffRole;
  status: StaffStatus;
  portalAccessEnabled: boolean;
  canAccessPortal: boolean;
  isOwner: boolean;
  pinCode: string | null;
  lastActivityAt: Date | null;
  lastPortalLoginAt: Date | null;
  accesses: StaffAccess[];
  accessGroupMemberships: StaffMembership[];
};
type AccessGroupPermission = {
  id: string;
  resource: string;
  action: string;
  conditions: string | null;
};
type AccessGroupRecord = {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  scope: AccessScope;
  isSystem: boolean;
  isDefault: boolean;
  permissions: AccessGroupPermission[];
  members: Array<{ id: string }>;
};
type ListStaffPrismaStub = {
  staff: { findMany: MockFn<StaffMember[]>; count: MockFn<number> };
  staffOutletAccess: { groupBy: MockFn };
  transaction: { groupBy: MockFn };
  $transaction: MockFn<Promise<unknown>, [Promise<unknown>[]]>;
};
type AccessGroupPrismaStub = {
  accessGroup: { count: MockFn<number>; findMany: MockFn<AccessGroupRecord[]> };
  $transaction: MockFn<Promise<unknown>, [Promise<unknown>[]]>;
};
type OutletPrismaStub = {
  merchantSettings: { findUnique: MockFn };
  outlet: { count: MockFn; create?: MockFn };
  $transaction: MockFn;
};
type MetricsStub = { inc: MockFn; observe: MockFn; setGauge: MockFn };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (
  stub: ListStaffPrismaStub | AccessGroupPrismaStub | OutletPrismaStub,
) => stub as unknown as PrismaService;
const asMerchantsService = (stub: MerchantsService) =>
  stub as unknown as MerchantsService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asCacheService = (stub: Record<string, unknown>) =>
  stub as unknown as LookupCacheService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
const buildService = (
  prisma: ListStaffPrismaStub | AccessGroupPrismaStub | OutletPrismaStub,
  metrics: MetricsStub,
  cache: Record<string, unknown>,
  merchants: MerchantsService = {} as MerchantsService,
) => {
  const prismaService = asPrismaService(prisma);
  const metricsService = asMetricsService(metrics);
  const cacheService = asCacheService(cache);
  const merchantsService = asMerchantsService(merchants);
  const accessGroups = new MerchantPanelAccessGroupsService(
    prismaService,
    metricsService,
  );
  const outlets = new MerchantPanelOutletsService(
    prismaService,
    merchantsService,
  );
  const cashiers = new MerchantPanelCashierService(
    prismaService,
    merchantsService,
  );
  return {
    service: new MerchantPanelService(
      prismaService,
      metricsService,
      cacheService,
      accessGroups,
      outlets,
      cashiers,
    ),
    accessGroups,
    outlets,
    cashiers,
  };
};

describe('MerchantPanelService', () => {
  it('listStaff returns mapped payload and records metrics', async () => {
    const staffMember: StaffMember = {
      id: 'stf_1',
      login: 'john',
      email: 'john@example.com',
      phone: null,
      firstName: 'John',
      lastName: 'Doe',
      position: 'Manager',
      comment: null,
      role: StaffRole.MERCHANT,
      status: StaffStatus.ACTIVE,
      portalAccessEnabled: true,
      canAccessPortal: true,
      isOwner: false,
      pinCode: '9876',
      lastActivityAt: new Date('2024-01-02T00:00:00Z'),
      lastPortalLoginAt: new Date('2024-01-01T00:00:00Z'),
      accesses: [
        {
          id: 'acc_1',
          outletId: 'out_1',
          outlet: { name: 'Главный магазин' },
          pinCode: '1234',
          status: StaffOutletAccessStatus.ACTIVE,
          lastTxnAt: new Date('2024-01-01T10:00:00Z'),
        },
      ],
      accessGroupMemberships: [
        {
          groupId: 'grp_1',
          group: { id: 'grp_1', name: 'Менеджеры', scope: AccessScope.PORTAL },
        },
      ],
    };

    const countMock = mockFn<number>()
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1) // active
      .mockResolvedValueOnce(0) // pending
      .mockResolvedValueOnce(0) // suspended
      .mockResolvedValueOnce(0) // fired
      .mockResolvedValueOnce(0) // archived
      .mockResolvedValueOnce(1); // portalEnabled

    const prisma: ListStaffPrismaStub = {
      staff: {
        findMany: mockFn<StaffMember[]>().mockResolvedValue([staffMember]),
        count: countMock,
      },
      staffOutletAccess: {
        groupBy: mockFn().mockResolvedValue([
          { staffId: 'stf_1', _count: { _all: 1 } },
        ]),
      },
      transaction: {
        groupBy: mockFn().mockResolvedValue([
          {
            staffId: 'stf_1',
            _max: { createdAt: new Date('2024-01-03T12:00:00Z') },
            _count: { _all: 2 },
          },
        ]),
      },
      $transaction: mockFn<
        Promise<unknown>,
        [Promise<unknown>[]]
      >().mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const merchants = {} as MerchantsService;
    const metrics: MetricsStub = {
      inc: mockFn(),
      observe: mockFn(),
      setGauge: mockFn(),
    };

    const { service } = buildService(
      prisma,
      metrics,
      { invalidateStaff: mockFn() },
      merchants,
    );
    const result = await service.listStaff(
      'mrc_1',
      {},
      { page: 1, pageSize: 20 },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.meta.total).toBe(1);
    expect(result.counters.active).toBe(1);
    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item).toBeDefined();
    expect(item.id).toBe('stf_1');
    expect(item.email).toBe('john@example.com');
    expect(item.role).toBe(StaffRole.MERCHANT);
    expect(item.pinCode).toBeNull();
    expect(item.outletsCount).toBe(1);
    expect(item.lastActivityAt).toBe(
      new Date('2024-01-03T12:00:00.000Z').toISOString(),
    );
    expect(Array.isArray(item.accesses)).toBe(true);
    expect(item.accesses[0]).toEqual(
      objectContaining({
        outletName: 'Главный магазин',
        status: StaffOutletAccessStatus.ACTIVE,
        pinCode: '1234',
        transactionsTotal: null,
      }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('portal_staff_list_total');
  });

  it('listAccessGroups maps response', async () => {
    const countMock = mockFn<number>().mockResolvedValue(1);
    const findManyMock = mockFn<AccessGroupRecord[]>().mockResolvedValue([
      {
        id: 'grp_Владелец',
        merchantId: 'mrc_1',
        name: 'Владелец',
        description: 'Полный доступ ко всем разделам портала',
        scope: AccessScope.PORTAL,
        isSystem: false,
        isDefault: true,
        permissions: [
          {
            id: 'per_1',
            resource: 'staff',
            action: 'read',
            conditions: null,
          },
          {
            id: 'per_2',
            resource: 'staff',
            action: 'update',
            conditions: null,
          },
        ],
        members: [{ id: 'm_1' }],
      },
    ]);

    const prisma: AccessGroupPrismaStub = {
      accessGroup: {
        count: countMock,
        findMany: findManyMock,
      },
      $transaction: mockFn<
        Promise<unknown>,
        [Promise<unknown>[]]
      >().mockImplementation((arg: Promise<unknown>[]) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve();
      }),
    };

    const merchants = {} as MerchantsService;
    const metrics: MetricsStub = {
      inc: mockFn(),
      observe: mockFn(),
      setGauge: mockFn(),
    };

    const { service } = buildService(
      prisma,
      metrics,
      { invalidateStaff: mockFn() },
      merchants,
    );
    const result = await service.listAccessGroups(
      'mrc_1',
      {},
      { page: 1, pageSize: 20 },
    );

    expect(prisma.accessGroup.count).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      objectContaining({
        id: 'grp_Владелец',
        name: 'Владелец',
        memberCount: 1,
      }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('portal_access_group_list_total');
  });

  it('blocks outlet creation when limit reached', async () => {
    const prisma: OutletPrismaStub = {
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ maxOutlets: 1 }),
      },
      outlet: {
        count: mockFn().mockResolvedValue(1),
      },
      $transaction: mockFn(),
    };
    const merchants = {} as MerchantsService;
    const metrics: MetricsStub = {
      inc: mockFn(),
      observe: mockFn(),
      setGauge: mockFn(),
    };

    const { service } = buildService(
      prisma,
      metrics,
      { invalidateStaff: mockFn() },
      merchants,
    );
    const payload: UpsertOutletPayload = { name: 'Main' };
    await expect(service.createOutlet('mrc_1', payload)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
