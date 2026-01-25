import { MerchantsService } from './merchants.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { MerchantsSettingsService } from './services/merchants-settings.service';
import type { LookupCacheService } from '../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { MerchantsAccessService } from './services/merchants-access.service';
import type { MerchantsStaffService } from './services/merchants-staff.service';
import type { MerchantsOutletsService } from './services/merchants-outlets.service';
import type { MerchantsOutboxService } from './services/merchants-outbox.service';
import type { MerchantsAntifraudService } from './services/merchants-antifraud.service';
import type { MerchantsLedgerService } from './services/merchants-ledger.service';
import type { MerchantsAdminService } from './services/merchants-admin.service';
import type { MerchantsPortalAuthService } from './services/merchants-portal-auth.service';
import type { MerchantsIntegrationsService } from './services/merchants-integrations.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type StaffRecord = {
  id: string;
  merchantId: string;
  status: string;
  login: string;
  firstName: string;
  lastName: string;
  role: string;
};
type OutletRecord = { id: string; name: string };
type AccessRecord = {
  id: string;
  outletId: string;
  pinCode: string;
  status: string;
  staff: StaffRecord;
  outlet: OutletRecord;
};
type CashierSessionCreateArgs = {
  data: {
    merchantId: string;
    staffId: string;
    outletId: string;
    tokenHash: string;
    rememberPin: boolean;
    expiresAt: Date;
  };
};
type CashierSessionRecord = {
  id: string;
  merchantId: string;
  staffId: string;
  outletId: string;
  startedAt: Date;
  lastSeenAt: Date;
  tokenHash: string;
  rememberPin: boolean;
  expiresAt: Date;
  staff: StaffRecord;
  outlet: OutletRecord;
};
type PrismaStub = {
  $transaction: MockFn<Promise<unknown>, [unknown[]]>;
  staffOutletAccess: { findMany: MockFn<AccessRecord[]> };
  cashierSession: {
    create: MockFn<CashierSessionRecord, [CashierSessionCreateArgs]>;
  };
  staff: { update: MockFn };
};
type CacheStub = {
  invalidateSettings: MockFn;
  invalidateOutlet: MockFn;
  invalidateStaff: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asCacheService = (stub: CacheStub) =>
  stub as unknown as LookupCacheService;
const asStaffService = (stub: object) => stub as MerchantsStaffService;
const asOutletsService = (stub: object) => stub as MerchantsOutletsService;
const asOutboxService = (stub: object) => stub as MerchantsOutboxService;
const asAntifraudService = (stub: object) => stub as MerchantsAntifraudService;
const asLedgerService = (stub: object) => stub as MerchantsLedgerService;
const asAdminService = (stub: object) => stub as MerchantsAdminService;
const asPortalAuthService = (stub: object) =>
  stub as MerchantsPortalAuthService;
const asIntegrationsService = (stub: object) =>
  stub as MerchantsIntegrationsService;
const makeAccessService = (prisma: PrismaStub, cache: CacheStub) =>
  new MerchantsAccessService(
    asPrismaService(prisma),
    asCacheService(cache),
    new AppConfigService(),
  );
const makeSettingsStub = () =>
  ({
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    normalizeRulesJson: jest.fn((value: unknown) => value),
  }) as unknown as MerchantsSettingsService;
const makeCacheStub = () =>
  ({
    invalidateSettings: jest.fn(),
    invalidateOutlet: jest.fn(),
    invalidateStaff: jest.fn(),
  }) as unknown as CacheStub;

describe('MerchantsService cashier sessions', () => {
  const fixedNow = new Date('2025-01-01T00:00:00.000Z');

  const makePrisma = (): PrismaStub => {
    const staff: StaffRecord = {
      id: 'S-1',
      merchantId: 'M-123',
      status: 'ACTIVE',
      login: 'alice',
      firstName: 'Алиса',
      lastName: 'Фриман',
      role: 'CASHIER',
    };

    const access: AccessRecord = {
      id: 'A-1',
      outletId: 'O-1',
      pinCode: '1234',
      status: 'ACTIVE',
      staff,
      outlet: { id: 'O-1', name: 'Флагманский магазин' },
    };

    const prisma: PrismaStub = {
      $transaction: mockFn<Promise<unknown>, [unknown[]]>().mockImplementation(
        (ops: unknown[]) => Promise.all(ops),
      ),
      staffOutletAccess: {
        findMany: mockFn<AccessRecord[]>().mockResolvedValue([access]),
      },
      cashierSession: {
        create: mockFn<
          CashierSessionRecord,
          [CashierSessionCreateArgs]
        >().mockImplementation((args: CashierSessionCreateArgs) => ({
          id: 'CS-1',
          merchantId: args.data.merchantId,
          staffId: args.data.staffId,
          outletId: args.data.outletId,
          startedAt: new Date(),
          lastSeenAt: new Date(),
          tokenHash: args.data.tokenHash,
          rememberPin: args.data.rememberPin,
          expiresAt: args.data.expiresAt,
          staff,
          outlet: { id: 'O-1', name: 'Флагманский магазин' },
        })),
      },
      staff: {
        update: mockFn().mockResolvedValue({ ok: true }),
      },
    };

    return prisma;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets expiresAt for non-remembered sessions (12h)', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    const prisma = makePrisma();
    const svc = new MerchantsService(
      makeSettingsStub(),
      makeAccessService(prisma, makeCacheStub()),
      asStaffService({}),
      asOutletsService({}),
      asOutboxService({}),
      asAntifraudService({}),
      asLedgerService({}),
      asAdminService({}),
      asPortalAuthService({}),
      asIntegrationsService({}),
    );

    await svc.startCashierSessionByMerchantId('M-123', '1234', false);

    const createArgs = prisma.cashierSession.create.mock.calls[0]?.[0] as
      | CashierSessionCreateArgs
      | undefined;
    if (!createArgs) {
      throw new Error('cashierSession.create not called');
    }
    expect(createArgs.data.rememberPin).toBe(false);
    expect(createArgs.data.expiresAt).toEqual(
      new Date('2025-01-01T12:00:00.000Z'),
    );
  });

  it('sets expiresAt for remembered sessions (~180 days)', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    const prisma = makePrisma();
    const svc = new MerchantsService(
      makeSettingsStub(),
      makeAccessService(prisma, makeCacheStub()),
      asStaffService({}),
      asOutletsService({}),
      asOutboxService({}),
      asAntifraudService({}),
      asLedgerService({}),
      asAdminService({}),
      asPortalAuthService({}),
      asIntegrationsService({}),
    );

    await svc.startCashierSessionByMerchantId('M-123', '1234', true);

    const createArgs = prisma.cashierSession.create.mock.calls[0]?.[0] as
      | CashierSessionCreateArgs
      | undefined;
    if (!createArgs) {
      throw new Error('cashierSession.create not called');
    }
    expect(createArgs.data.rememberPin).toBe(true);
    expect(createArgs.data.expiresAt).toEqual(
      new Date('2025-06-30T00:00:00.000Z'),
    );
  });
});
