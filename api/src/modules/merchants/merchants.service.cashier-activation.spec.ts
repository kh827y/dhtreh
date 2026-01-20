import crypto from 'crypto';
import { MerchantsService } from './merchants.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { MerchantsSettingsService } from './services/merchants-settings.service';
import type { LookupCacheService } from '../../core/cache/lookup-cache.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type CashierActivationCodeCreateArgs = {
  data: {
    merchantId: string;
    tokenHash: string;
    tokenHint: string;
    expiresAt: Date;
  };
};
type CashierActivationCodeUpdateManyArgs = {
  where: {
    merchantId: string;
    tokenHash: string;
  };
};
type CashierDeviceSessionCreateArgs = {
  data: {
    merchantId: string;
    expiresAt: Date;
    tokenHash: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};
type CashierDeviceSessionUpdateArgs = {
  where: { id: string };
  data: { revokedAt: Date };
};
type CashierDeviceSessionFindFirstResult = {
  id: string;
  merchantId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  merchant: { cashierLogin: string };
};
type CashierActivationTx = {
  cashierActivationCode: {
    create: MockFn<unknown, [CashierActivationCodeCreateArgs]>;
    updateMany: MockFn<unknown, [CashierActivationCodeUpdateManyArgs]>;
  };
  cashierDeviceSession: {
    create: MockFn<
      { id: string; merchantId: string; expiresAt: Date },
      [CashierDeviceSessionCreateArgs]
    >;
  };
};
type PrismaTransactionStub = {
  $transaction: MockFn<
    Promise<unknown>,
    [(tx: CashierActivationTx) => Promise<unknown>]
  >;
  merchant?: {
    findFirst: MockFn<unknown, [unknown?]>;
  };
};
type PrismaSessionStub = {
  cashierDeviceSession: {
    findFirst: MockFn<CashierDeviceSessionFindFirstResult | null, [unknown?]>;
    update: MockFn<unknown, [CashierDeviceSessionUpdateArgs]>;
  };
};
type CacheStub = {
  invalidateSettings: MockFn;
  invalidateOutlet: MockFn;
  invalidateStaff: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaTransactionStub | PrismaSessionStub) =>
  stub as unknown as PrismaService;
const asCacheService = (stub: CacheStub) =>
  stub as unknown as LookupCacheService;
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;
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
  }) as CacheStub;

describe('MerchantsService cashier activation codes', () => {
  const fixedNow = new Date('2025-01-01T00:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues 9-digit activation codes valid for 3 days', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    let created = 0;
    const tx: CashierActivationTx = {
      cashierActivationCode: {
        create: mockFn<
          unknown,
          [CashierActivationCodeCreateArgs]
        >().mockImplementation(() => {
          created += 1;
          return { id: `C-${created}` };
        }),
        updateMany: mockFn<unknown, [CashierActivationCodeUpdateManyArgs]>(),
      },
      cashierDeviceSession: {
        create: mockFn<
          { id: string; merchantId: string; expiresAt: Date },
          [CashierDeviceSessionCreateArgs]
        >(),
      },
    };
    const prisma: PrismaTransactionStub = {
      $transaction: mockFn<
        Promise<unknown>,
        [(tx: CashierActivationTx) => Promise<unknown>]
      >().mockImplementation((cb) => cb(tx)),
    };
    const svc = new MerchantsService(
      asPrismaService(prisma),
      makeSettingsStub(),
      asCacheService(makeCacheStub()),
    );

    const result = await svc.issueCashierActivationCodes('M-123', 2);

    expect(result.expiresAt).toBe('2025-01-04T00:00:00.000Z');
    expect(result.codes).toHaveLength(2);
    expect(result.items).toHaveLength(2);
    for (const code of result.codes) {
      expect(code).toMatch(/^[0-9]{9}$/);
    }

    const createCalls = tx.cashierActivationCode.create.mock.calls as [
      CashierActivationCodeCreateArgs,
    ][];
    expect(createCalls).toHaveLength(2);
    for (let i = 0; i < createCalls.length; i += 1) {
      const args = createCalls[i]?.[0];
      const code = result.codes[i];
      const expectedHash = crypto
        .createHash('sha256')
        .update(code, 'utf8')
        .digest('hex');
      expect(args.data.merchantId).toBe('M-123');
      expect(args.data.tokenHash).toBe(expectedHash);
      expect(args.data.tokenHint).toBe(code.slice(-3));
      expect(args.data.expiresAt).toEqual(new Date('2025-01-04T00:00:00.000Z'));
    }
  });

  it('activates device by code and creates device session', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const tx: CashierActivationTx = {
      cashierActivationCode: {
        create: mockFn<unknown, [CashierActivationCodeCreateArgs]>(),
        updateMany: mockFn<unknown, [CashierActivationCodeUpdateManyArgs]>()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValue({ count: 1 }),
      },
      cashierDeviceSession: {
        create: mockFn<
          { id: string; merchantId: string; expiresAt: Date },
          [CashierDeviceSessionCreateArgs]
        >().mockImplementation((args: CashierDeviceSessionCreateArgs) => ({
          id: 'DS-1',
          merchantId: args.data.merchantId,
          expiresAt: args.data.expiresAt,
        })),
      },
    };

    const prisma: PrismaTransactionStub = {
      merchant: {
        findFirst: mockFn<unknown, [unknown?]>().mockResolvedValue({
          id: 'M-123',
          cashierLogin: 'greenmarket-01',
        }),
      },
      $transaction: mockFn<
        Promise<unknown>,
        [(tx: CashierActivationTx) => Promise<unknown>]
      >().mockImplementation((cb) => cb(tx)),
    };

    const svc = new MerchantsService(
      asPrismaService(prisma),
      makeSettingsStub(),
      asCacheService(makeCacheStub()),
    );

    const result = await svc.activateCashierDeviceByCode(
      'GreenMarket-01',
      '123-456-789',
      {
        ip: '1.2.3.4',
        userAgent: 'UA',
      },
    );

    expect(result.merchantId).toBe('M-123');
    expect(result.login).toBe('greenmarket-01');
    expect(result.token).toMatch(/^[0-9a-f]{96}$/);
    expect(result.expiresAt).toBe('2025-06-30T00:00:00.000Z');

    const createdArgs = tx.cashierDeviceSession.create.mock.calls[0]?.[0] as
      | CashierDeviceSessionCreateArgs
      | undefined;
    if (!createdArgs) {
      throw new Error('cashierDeviceSession.create not called');
    }
    const expectedDeviceHash = crypto
      .createHash('sha256')
      .update(result.token, 'utf8')
      .digest('hex');
    expect(createdArgs.data.merchantId).toBe('M-123');
    expect(createdArgs.data.tokenHash).toBe(expectedDeviceHash);
    expect(createdArgs.data.expiresAt).toEqual(
      new Date('2025-06-30T00:00:00.000Z'),
    );
    expect(createdArgs.data.ipAddress).toBe('1.2.3.4');
    expect(createdArgs.data.userAgent).toBe('UA');

    const expectedCodeHash = crypto
      .createHash('sha256')
      .update('123456789', 'utf8')
      .digest('hex');
    expect(tx.cashierActivationCode.updateMany).toHaveBeenCalledWith(
      objectContaining({
        where: objectContaining({
          merchantId: 'M-123',
          tokenHash: expectedCodeHash,
        }),
      }),
    );
  });

  it('rejects activation when code is invalid', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const tx: CashierActivationTx = {
      cashierActivationCode: {
        create: mockFn<unknown, [CashierActivationCodeCreateArgs]>(),
        updateMany: mockFn<
          unknown,
          [CashierActivationCodeUpdateManyArgs]
        >().mockResolvedValue({
          count: 0,
        }),
      },
      cashierDeviceSession: {
        create: mockFn<
          { id: string; merchantId: string; expiresAt: Date },
          [CashierDeviceSessionCreateArgs]
        >(),
      },
    };
    const prisma: PrismaTransactionStub = {
      merchant: {
        findFirst: mockFn<unknown, [unknown?]>().mockResolvedValue({
          id: 'M-123',
          cashierLogin: 'greenmarket-01',
        }),
      },
      $transaction: mockFn<
        Promise<unknown>,
        [(tx: CashierActivationTx) => Promise<unknown>]
      >().mockImplementation((cb) => cb(tx)),
    };
    const svc = new MerchantsService(
      asPrismaService(prisma),
      makeSettingsStub(),
      asCacheService(makeCacheStub()),
    );

    await expect(
      svc.activateCashierDeviceByCode('greenmarket-01', '123456789'),
    ).rejects.toThrow('Invalid or expired activation code');
  });

  it('revokes expired device sessions on read', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const prisma: PrismaSessionStub = {
      cashierDeviceSession: {
        findFirst: mockFn<
          CashierDeviceSessionFindFirstResult | null,
          [unknown?]
        >().mockResolvedValue({
          id: 'DS-1',
          merchantId: 'M-123',
          expiresAt: new Date('2024-12-31T23:59:59.999Z'),
          lastSeenAt: new Date('2024-12-31T00:00:00.000Z'),
          merchant: { cashierLogin: 'greenmarket-01' },
        }),
        update: mockFn<
          unknown,
          [CashierDeviceSessionUpdateArgs]
        >().mockResolvedValue({
          ok: true,
        }),
      },
    };

    const svc = new MerchantsService(
      asPrismaService(prisma),
      makeSettingsStub(),
      asCacheService(makeCacheStub()),
    );
    const session = await svc.getCashierDeviceSessionByToken('device-token');

    expect(session).toBeNull();
    expect(prisma.cashierDeviceSession.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 'DS-1' },
        data: { revokedAt: fixedNow },
      }),
    );
  });
});
