import { MerchantPanelService } from './merchant-panel.service';
import { StaffStatus, StaffRole, AccessScope, StaffOutletAccessStatus } from '@prisma/client';

describe('MerchantPanelService', () => {
  it('listStaff returns mapped payload and records metrics', async () => {
    const staffMember: any = {
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

    const countMock = jest
      .fn()
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1) // active
      .mockResolvedValueOnce(0) // pending
      .mockResolvedValueOnce(0) // suspended
      .mockResolvedValueOnce(0) // fired
      .mockResolvedValueOnce(0) // archived
      .mockResolvedValueOnce(1); // portalEnabled

    const prisma: any = {
      staff: {
        findMany: jest.fn().mockResolvedValue([staffMember]),
        count: countMock,
      },
      staffOutletAccess: {
        groupBy: jest.fn().mockResolvedValue([{ staffId: 'stf_1', _count: { _all: 1 } }]),
      },
      transaction: {
        groupBy: jest.fn().mockResolvedValue([{ staffId: 'stf_1', _max: { createdAt: new Date('2024-01-03T12:00:00Z') }, _count: { _all: 2 } }]),
      },
      $transaction: jest.fn((operations: Promise<any>[]) => Promise.all(operations)),
    };
    const merchants: any = {};
    const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

    const service = new MerchantPanelService(prisma, merchants, metrics);
    const result = await service.listStaff('mrc_1', {}, { page: 1, pageSize: 20 });

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
    expect(item.lastActivityAt).toBe(new Date('2024-01-03T12:00:00.000Z').toISOString());
    expect(Array.isArray(item.accesses)).toBe(true);
    expect(item.accesses[0]).toEqual(
      expect.objectContaining({
        outletName: 'Главный магазин',
        status: StaffOutletAccessStatus.ACTIVE,
        pinCode: '1234',
        transactionsTotal: null,
      }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('portal_staff_list_total');
  });

  it('listAccessGroups bootstraps defaults and maps response', async () => {
    const createMock = jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({
          id: `grp_${data.name}`,
          name: data.name,
          description: data.description,
          scope: data.scope,
          isSystem: data.isSystem,
          isDefault: data.isDefault,
          permissions: [],
        }),
      );
    const createManyMock = jest.fn().mockResolvedValue(undefined);
    const countMock = jest.fn().mockResolvedValue(1);
    const findManyMock = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'grp_Владелец',
          merchantId: 'mrc_1',
          name: 'Владелец',
          description: 'Полный доступ ко всем разделам портала',
          scope: AccessScope.PORTAL,
          isSystem: true,
          isDefault: true,
          permissions: [
            { id: 'per_1', resource: 'staff', action: 'read', conditions: null },
            { id: 'per_2', resource: 'staff', action: 'update', conditions: null },
          ],
          members: [{ id: 'm_1' }],
        },
      ]);

    const prisma: any = {
      accessGroup: {
        count: countMock,
        findMany: findManyMock,
      },
      accessGroupPermission: {
        createMany: createManyMock,
      },
      staffAccessGroup: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((arg: any) => {
        if (typeof arg === 'function') {
          const tx = {
            accessGroup: { create: createMock },
            accessGroupPermission: { createMany: createManyMock },
          } as any;
          return Promise.resolve(arg(tx));
        }
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve();
      }),
    };

    const merchants: any = {};
    const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

    const service = new MerchantPanelService(prisma, merchants, metrics);
    (service as any).logger = { log: jest.fn() };
    const expectedCreated = ((service as any).defaultAccessGroupPresets || []).length || 0;
    const result = await service.listAccessGroups('mrc_1', {}, { page: 1, pageSize: 20 });

    expect(prisma.accessGroup.count).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalled();
    expect(createManyMock).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: 'grp_Владелец', name: 'Владелец', memberCount: 1 }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('portal_access_group_bootstrap_total', {}, expectedCreated);
    expect(metrics.inc).toHaveBeenCalledWith('portal_access_group_list_total');
  });
});
