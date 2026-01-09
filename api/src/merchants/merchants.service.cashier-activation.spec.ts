import crypto from 'crypto';
import { MerchantsService } from './merchants.service';

describe('MerchantsService cashier activation codes', () => {
  const fixedNow = new Date('2025-01-01T00:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  it('issues 9-digit activation codes valid for 3 days', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    let created = 0;
    const tx: any = {
      cashierActivationCode: {
        create: jest.fn().mockImplementation(async () => {
          created += 1;
          return { id: `C-${created}` };
        }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const svc = new MerchantsService(prisma);

    const result = await svc.issueCashierActivationCodes('M-123', 2);

    expect(result.expiresAt).toBe('2025-01-04T00:00:00.000Z');
    expect(result.codes).toHaveLength(2);
    expect(result.items).toHaveLength(2);
    for (const code of result.codes) {
      expect(code).toMatch(/^[0-9]{9}$/);
    }

    const createCalls = tx.cashierActivationCode.create.mock.calls;
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

    const tx: any = {
      cashierActivationCode: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValue({ count: 1 }),
      },
      cashierDeviceSession: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'DS-1',
          merchantId: data.merchantId,
          expiresAt: data.expiresAt,
        })),
      },
    };

    const prisma: any = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'M-123',
          cashierLogin: 'greenmarket-01',
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    const svc = new MerchantsService(prisma);

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

    const createdArgs = tx.cashierDeviceSession.create.mock.calls[0]?.[0];
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
      expect.objectContaining({
        where: expect.objectContaining({
          merchantId: 'M-123',
          tokenHash: expectedCodeHash,
        }),
      }),
    );
  });

  it('rejects activation when code is invalid', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const tx: any = {
      cashierActivationCode: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      cashierDeviceSession: { create: jest.fn() },
    };
    const prisma: any = {
      merchant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'M-123',
          cashierLogin: 'greenmarket-01',
        }),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const svc = new MerchantsService(prisma);

    await expect(
      svc.activateCashierDeviceByCode('greenmarket-01', '123456789'),
    ).rejects.toThrow('Invalid or expired activation code');
  });

  it('revokes expired device sessions on read', async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const prisma: any = {
      cashierDeviceSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'DS-1',
          merchantId: 'M-123',
          expiresAt: new Date('2024-12-31T23:59:59.999Z'),
          lastSeenAt: new Date('2024-12-31T00:00:00.000Z'),
          merchant: { cashierLogin: 'greenmarket-01' },
        }),
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    };

    const svc = new MerchantsService(prisma);
    const session = await svc.getCashierDeviceSessionByToken('device-token');

    expect(session).toBeNull();
    expect(prisma.cashierDeviceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'DS-1' },
        data: { revokedAt: fixedNow },
      }),
    );
  });
});
