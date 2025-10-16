import { PointsTtlReminderWorker } from './points-ttl-reminder.worker';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('PointsTtlReminderWorker', () => {
  const origEnv = { ...process.env };
  const now = new Date('2025-10-20T10:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    process.env.POINTS_TTL_REMINDER = '1';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  function makeWorker(overrides: Partial<any> = {}) {
    const prisma = {
      merchantCustomer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      pushNotification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      earnLot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };
    const metrics = {
      inc: jest.fn(),
      setGauge: jest.fn(),
    };
    const push = {
      sendPush: jest.fn().mockResolvedValue({ success: true }),
    };
    const worker = new PointsTtlReminderWorker(
      prisma as any,
      metrics as any,
      push as any,
    );
    return { worker, prisma, metrics, push };
  }

  it('sends reminder with placeholders resolved', async () => {
    const ttlDays = 30;
    const daysBefore = 5;
    const earnedAt = new Date(now.getTime() - (ttlDays - 3) * DAY_MS);
    const burnDate = new Date(earnedAt.getTime() + ttlDays * DAY_MS);

    const { worker, prisma, push } = makeWorker({
      earnLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'C1',
            points: 150,
            consumedPoints: 20,
            earnedAt,
          },
        ]),
      },
      merchantCustomer: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { customerId: 'C1', name: 'Иван', tgId: '12345' },
          ]),
      },
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'C1', name: 'Иван Иванов' }]),
      },
      pushNotification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    await (worker as any).processMerchant({
      merchantId: 'M1',
      merchantName: 'Coffee',
      ttlDays,
      daysBefore,
      template:
        'Привет, %username%! Баллы в размере %amount% сгорят %burn_date%.',
    });

    expect(prisma.earnLot.findMany).toHaveBeenCalled();
    expect(push.sendPush).toHaveBeenCalledTimes(1);
    const payload = push.sendPush.mock.calls[0][0];
    expect(payload.merchantId).toBe('M1');
    expect(payload.customerId).toBe('C1');
    expect(payload.title).toBe('');
    expect(payload.type).toBe('SYSTEM');
    expect(payload.body).toContain('Привет, Иван!');
    expect(payload.body).toContain('130');
    const expectedDate = burnDate
      .toISOString()
      .slice(0, 10)
      .split('-')
      .reverse()
      .join('.');
    expect(payload.body).toContain(expectedDate);
    expect(payload.data).toEqual({
      burnDate: burnDate.toISOString().slice(0, 10),
      amount: '130',
      type: 'ttl_reminder',
    });
  });

  it('skips reminder when duplicate exists', async () => {
    const ttlDays = 15;
    const daysBefore = 3;
    const earnedAt = new Date(now.getTime() - (ttlDays - 1) * DAY_MS);
    const burnDateIso = new Date(earnedAt.getTime() + ttlDays * DAY_MS)
      .toISOString()
      .slice(0, 10);

    const { worker, prisma, push } = makeWorker({
      earnLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'C1',
            points: 60,
            consumedPoints: 0,
            earnedAt,
          },
        ]),
      },
      merchantCustomer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ customerId: 'C1', name: null, tgId: '999' }]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      pushNotification: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where.data?.equals === burnDateIso) {
            return Promise.resolve({ id: 'PN1' });
          }
          return Promise.resolve(null);
        }),
      },
    });

    await (worker as any).processMerchant({
      merchantId: 'M1',
      merchantName: null,
      ttlDays,
      daysBefore,
      template: 'Баллы в размере %amount% сгорят %burn_date%.',
    });

    expect(push.sendPush).not.toHaveBeenCalled();
  });

  it('skips customers without telegram binding', async () => {
    const ttlDays = 20;
    const daysBefore = 2;
    const earnedAt = new Date(now.getTime() - (ttlDays - 1) * DAY_MS);

    const { worker, push } = makeWorker({
      earnLot: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'C1',
            points: 40,
            consumedPoints: 0,
            earnedAt,
          },
        ]),
      },
      merchantCustomer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ customerId: 'C1', name: 'NoTg', tgId: null }]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    await (worker as any).processMerchant({
      merchantId: 'M1',
      merchantName: null,
      ttlDays,
      daysBefore,
      template:
        'Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!',
    });

    expect(push.sendPush).not.toHaveBeenCalled();
  });
});
