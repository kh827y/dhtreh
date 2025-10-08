import { NotificationDispatcherWorker as Worker } from '../src/notification-dispatcher.worker';
import { MetricsService } from '../src/metrics.service';

function makePrismaMock() {
  const prisma: any = {
    $queryRaw: jest.fn(),
    eventOutbox: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    segmentCustomer: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    merchant: { findUnique: jest.fn() },
    adminAudit: { create: jest.fn() },
  };
  return prisma;
}

describe('NotificationDispatcherWorker - metrics', () => {
  const push = {
    sendPush: jest.fn(async () => ({ total: 2, sent: 2, failed: 0 })),
    sendToTopic: jest.fn(async () => ({ success: true })),
  } as any;
  const email = { sendEmail: jest.fn(async () => true) } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WORKERS_ENABLED = '1';
    process.env.NOTIFY_WORKER_INTERVAL_MS = '3600000';
  });

  it('increments per-channel metrics with merchantId labels and processed sent', async () => {
    const metrics = new MetricsService();
    const incSpy = jest.spyOn(metrics, 'inc');

    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
      {
        id: 'E100',
        merchantId: 'M-1',
        eventType: 'notify.broadcast',
        payload: {
          merchantId: 'M-1',
          channel: 'ALL',
          segmentId: 'S1',
          template: { subject: 'Hi', text: 'T' },
          variables: {},
        },
        status: 'PENDING',
        retries: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: now,
      },
    ]);
    prisma.eventOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.segmentCustomer.findMany.mockResolvedValue([
      { customerId: 'C1' },
      { customerId: 'C2' },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'C1', email: 'a@a', name: 'A' },
      { id: 'C2', email: 'b@b', name: 'B' },
    ]);
    prisma.merchant.findUnique.mockResolvedValue({ name: 'Shop' });
    prisma.eventOutbox.update.mockResolvedValue({});

    const w = new Worker(prisma, metrics, push, email);
    // ensure no throttle
    // @ts-ignore
    await (w as any).loadRpsConfig?.();
    await (w as any).tick();

    // Expect metrics for channels with merchantId labels
    expect(incSpy).toHaveBeenCalledWith(
      'notifications_channel_attempts_total',
      { channel: 'PUSH', merchantId: 'M-1' },
      expect.any(Number),
    );
    expect(incSpy).toHaveBeenCalledWith(
      'notifications_channel_attempts_total',
      { channel: 'EMAIL', merchantId: 'M-1' },
      expect.any(Number),
    );
    expect(incSpy).toHaveBeenCalledWith('notifications_processed_total', {
      type: 'broadcast',
      result: 'sent',
    });
  });

  it('increments throttled processed metric when hit RPS limit', async () => {
    const metrics = new MetricsService();
    const incSpy = jest.spyOn(metrics, 'inc');

    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
      {
        id: 'E1',
        merchantId: 'M-TH',
        eventType: 'notify.broadcast',
        payload: {
          merchantId: 'M-TH',
          channel: 'PUSH',
          template: { text: 'Hi' },
        },
        status: 'PENDING',
        retries: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: now,
      },
      {
        id: 'E2',
        merchantId: 'M-TH',
        eventType: 'notify.broadcast',
        payload: {
          merchantId: 'M-TH',
          channel: 'PUSH',
          template: { text: 'Hi' },
        },
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
    (w as any).loadRpsConfig?.();
    // Manually set RPS=1 for merchant to trigger throttle
    (w as any).rpsByMerchant?.set('M-TH', 1);
    await (w as any).tick();

    expect(incSpy).toHaveBeenCalledWith('notifications_processed_total', {
      type: 'broadcast',
      result: 'throttled',
    });
  });
});
