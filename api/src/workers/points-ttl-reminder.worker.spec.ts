import { PointsTtlReminderWorker } from './points-ttl-reminder.worker';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { PushService } from '../modules/notifications/push/push.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type EarnLotRecord = {
  customerId: string;
  points: number;
  consumedPoints: number;
  earnedAt: Date;
};
type CustomerRecord = {
  id: string;
  name: string | null;
  tgId: string | null;
  merchantId: string;
};
type PushPayload = {
  merchantId: string;
  customerId: string;
  title: string;
  type: string;
  body: string;
  data: { burnDate: string; amount: string; type: string };
};
type PrismaStub = {
  customer: { findMany: MockFn<Promise<CustomerRecord[]>, [unknown?]> };
  pushNotification: { findFirst: MockFn<Promise<unknown>, [unknown?]> };
  earnLot: { findMany: MockFn<Promise<EarnLotRecord[]>, [unknown?]> };
};
type MetricsStub = { inc: MockFn; setGauge: MockFn };
type PushStub = {
  sendPush: MockFn<Promise<{ success: boolean }>, [PushPayload]>;
};
type WorkerPrivate = {
  processMerchant: (input: {
    merchantId: string;
    merchantName: string | null;
    ttlDays: number;
    daysBefore: number;
    template: string;
  }) => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPushService = (stub: PushStub) => stub as unknown as PushService;
const asPrivateWorker = (worker: PointsTtlReminderWorker) =>
  worker as unknown as WorkerPrivate;

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

  function makeWorker(overrides: Partial<PrismaStub> = {}) {
    const prisma: PrismaStub = {
      customer: {
        findMany: mockFn<
          Promise<CustomerRecord[]>,
          [unknown?]
        >().mockResolvedValue([]),
      },
      pushNotification: {
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
      earnLot: {
        findMany: mockFn<
          Promise<EarnLotRecord[]>,
          [unknown?]
        >().mockResolvedValue([]),
      },
      ...overrides,
    };
    const metrics: MetricsStub = {
      inc: mockFn(),
      setGauge: mockFn(),
    };
    const push: PushStub = {
      sendPush: mockFn<
        Promise<{ success: boolean }>,
        [PushPayload]
      >().mockResolvedValue({ success: true }),
    };
    const worker = new PointsTtlReminderWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPushService(push),
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
        findMany: mockFn<
          Promise<EarnLotRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          {
            customerId: 'C1',
            points: 150,
            consumedPoints: 20,
            earnedAt,
          },
        ]),
      },
      customer: {
        findMany: mockFn<
          Promise<CustomerRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          { id: 'C1', name: 'Иван', tgId: '12345', merchantId: 'M1' },
        ]),
      },
      pushNotification: {
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
    });

    const workerPrivate = asPrivateWorker(worker);
    await workerPrivate.processMerchant({
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
    const { worker, push } = makeWorker({
      earnLot: {
        findMany: mockFn<
          Promise<EarnLotRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          {
            customerId: 'C1',
            points: 60,
            consumedPoints: 0,
            earnedAt,
          },
        ]),
      },
      customer: {
        findMany: mockFn<
          Promise<CustomerRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          { id: 'C1', name: null, tgId: '999', merchantId: 'M1' },
        ]),
      },
      pushNotification: {
        findFirst: mockFn<
          Promise<{ id: string }>,
          [unknown?]
        >().mockResolvedValue({ id: 'PN1' }),
      },
    });

    const workerPrivate = asPrivateWorker(worker);
    await workerPrivate.processMerchant({
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
        findMany: mockFn<
          Promise<EarnLotRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          {
            customerId: 'C1',
            points: 40,
            consumedPoints: 0,
            earnedAt,
          },
        ]),
      },
      customer: {
        findMany: mockFn<
          Promise<CustomerRecord[]>,
          [unknown?]
        >().mockResolvedValue([
          { id: 'C1', name: 'NoTg', tgId: null, merchantId: 'M1' },
        ]),
      },
    });

    const workerPrivate = asPrivateWorker(worker);
    await workerPrivate.processMerchant({
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
