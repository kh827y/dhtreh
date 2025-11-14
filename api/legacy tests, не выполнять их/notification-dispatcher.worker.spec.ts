import { NotificationDispatcherWorker as Worker } from '../src/notification-dispatcher.worker';
import { MetricsService } from '../src/metrics.service';

// Simple helpers to create mock prisma and services
function makePrismaMock() {
  const calls: any[] = [];
  const prisma: any = {
    $queryRaw: jest.fn(),
    eventOutbox: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(2),
    },
    segmentCustomer: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    merchant: { findUnique: jest.fn() },
    adminAudit: { create: jest.fn() },
  };
  return prisma;
}

describe('NotificationDispatcherWorker - RPS throttle', () => {
  const push = {
    sendPush: jest.fn(async () => ({ total: 2, sent: 2, failed: 0 })),
    sendToTopic: jest.fn(async () => ({ success: true })),
  } as any;
  const email = { sendEmail: jest.fn(async () => true) } as any;
  const metrics = new MetricsService();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, 'setInterval');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('throttles per merchant (NOTIFY_RPS_DEFAULT=1) and reschedules second event', async () => {
    process.env.WORKERS_ENABLED = '1';
    process.env.NOTIFY_WORKER_INTERVAL_MS = '3600000'; // avoid interval running
    process.env.NOTIFY_RPS_DEFAULT = '1';

    const prisma = makePrismaMock();
    // Advisory lock ok
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);
    // Two events for same merchant
    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
      {
        id: 'E1',
        merchantId: 'M-1',
        eventType: 'notify.broadcast',
        payload: { channel: 'PUSH', template: { text: 'Hi' } },
        status: 'PENDING',
        retries: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: now,
      },
      {
        id: 'E2',
        merchantId: 'M-1',
        eventType: 'notify.broadcast',
        payload: { channel: 'PUSH', template: { text: 'Hi' } },
        status: 'PENDING',
        retries: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: now,
      },
    ]);
    prisma.eventOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventOutbox.update.mockResolvedValue({});

    const w = new Worker(prisma, metrics, push, email);
    // Load RPS config without starting interval

    (w as any).loadRpsConfig();
    // call private tick()

    await (w as any).tick();

    // Should claim/update both at different paths: first -> SENT, second -> throttled back to PENDING with nextRetryAt ~ +1s
    const updates = prisma.eventOutbox.update.mock.calls.map(
      (c: any[]) => c[0],
    );
    const anySent = updates.some((u: any) => u?.data?.status === 'SENT');
    const anyThrottled = updates.find(
      (u: any) =>
        u?.data?.status === 'PENDING' && u?.data?.lastError === 'throttled',
    );

    expect(anySent).toBe(true);
    expect(anyThrottled).toBeTruthy();
    expect(typeof anyThrottled?.data?.nextRetryAt?.getTime).toBe('function');
  });
});
