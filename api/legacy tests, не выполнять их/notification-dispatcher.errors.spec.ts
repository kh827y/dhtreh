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

describe('NotificationDispatcherWorker - errors/retries', () => {
  const push = {
    sendPush: jest.fn(async () => ({ total: 1, sent: 1, failed: 0 })),
    sendToTopic: jest.fn(async () => ({ success: true })),
  } as any;
  const email = { sendEmail: jest.fn(async () => true) } as any;
  const metrics = new MetricsService();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WORKERS_ENABLED = '1';
    process.env.NOTIFY_WORKER_INTERVAL_MS = '3600000'; // prevent auto tick
  });

  it('sets PENDING with retry and nextRetryAt on error (and increments retries)', async () => {
    process.env.NOTIFY_MAX_RETRIES = '3';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

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
    ]);
    prisma.eventOutbox.updateMany.mockResolvedValue({ count: 1 });
    // First update (mark SENT) throws, then retry update succeeds
    prisma.eventOutbox.update.mockImplementationOnce(() => {
      throw new Error('db error');
    });
    prisma.eventOutbox.update.mockResolvedValue({});

    const w = new Worker(prisma, metrics, push, email);
    await (w as any).tick();

    const calls = prisma.eventOutbox.update.mock.calls.map((c: any[]) => c[0]);
    const retryUpdate = calls.find((u: any) => u?.data?.status === 'PENDING');
    expect(retryUpdate?.data?.retries).toBe(1);
    expect(typeof retryUpdate?.data?.nextRetryAt?.getTime).toBe('function');
    expect(String(retryUpdate?.data?.lastError || '')).toContain('db error');
  });

  it('marks DEAD when retries exceed NOTIFY_MAX_RETRIES', async () => {
    process.env.NOTIFY_MAX_RETRIES = '1';
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
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
    // First update throws to trigger catch
    prisma.eventOutbox.update.mockImplementationOnce(() => {
      throw new Error('hard err');
    });
    prisma.eventOutbox.update.mockResolvedValue({});

    const w = new Worker(prisma, metrics, push, email);
    // private method access for tests
    await (w as any).tick();

    const calls = prisma.eventOutbox.update.mock.calls.map((c: any[]) => c[0]);
    const deadUpdate = calls.find((u: any) => u?.data?.status === 'DEAD');
    expect(deadUpdate).toBeTruthy();
    expect(deadUpdate?.data?.retries).toBe(1);
    expect(String(deadUpdate?.data?.lastError || '')).toContain('hard err');
  });

  it('acknowledges unknown notify type as SENT', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
      {
        id: 'E3',
        merchantId: 'M-1',
        eventType: 'notify.unknown',
        payload: {},
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
    await (w as any).tick();

    const calls = prisma.eventOutbox.update.mock.calls.map((c: any[]) => c[0]);
    const sent = calls.find(
      (u: any) =>
        u?.data?.status === 'SENT' &&
        u?.data?.lastError === 'unknown notify type',
    );
    expect(sent).toBeTruthy();
  });

  it('notify.test is marked SENT in test env without provider calls', async () => {
    const prisma = makePrismaMock();
    prisma.$queryRaw.mockResolvedValue([{ ok: true }]);

    const now = new Date();
    prisma.eventOutbox.findMany.mockResolvedValue([
      {
        id: 'E4',
        merchantId: 'M-1',
        eventType: 'notify.test',
        payload: {
          channel: 'EMAIL',
          to: 'u@example.com',
          template: { subject: 'T' },
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
    await (w as any).tick();

    // In test env, it shouldn't call providers for notify.test
    expect(email.sendEmail).not.toHaveBeenCalled();

    const calls = prisma.eventOutbox.update.mock.calls.map((c: any[]) => c[0]);
    const sent = calls.find(
      (u: any) =>
        u?.data?.status === 'SENT' && u?.data?.lastError === 'test-env',
    );
    expect(sent).toBeTruthy();
  });
});
