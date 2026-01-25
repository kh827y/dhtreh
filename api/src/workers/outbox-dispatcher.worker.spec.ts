import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { MetricsService } from '../core/metrics/metrics.service';
import { AppConfigService } from '../core/config/app-config.service';
import type { EventOutbox } from '@prisma/client';
import {
  fetchWithTimeout,
  recordExternalRequest,
  readResponseTextSafe,
} from '../shared/http/external-http.util';

jest.mock('../shared/http/external-http.util', () => {
  const actual = jest.requireActual('../shared/http/external-http.util');
  return {
    ...actual,
    fetchWithTimeout: jest.fn(),
    recordExternalRequest: jest.fn(),
    readResponseTextSafe: jest.fn(),
  };
});

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  merchantSettings: {
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
  eventOutbox: {
    update: MockFn<Promise<unknown>, [unknown?]>;
    updateMany: MockFn<Promise<{ count: number }>, [unknown?]>;
    findMany: MockFn<Promise<EventOutbox[]>, [unknown?]>;
    count: MockFn<Promise<number>, [unknown?]>;
  };
};

type MetricsStub = {
  inc: MockFn;
  setGauge: MockFn;
};

type WorkerPrivate = {
  send: (row: EventOutbox) => Promise<void>;
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateWorker = (worker: OutboxDispatcherWorker) =>
  worker as unknown as WorkerPrivate;

const makeResponse = (status: number, body = ''): Response => {
  if (typeof Response === 'function') {
    return new Response(body, { status });
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'ERROR',
    headers: { get: () => null },
    text: async () => body,
  } as Response;
};

describe('OutboxDispatcherWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  const makeWorker = (overrides: Partial<PrismaStub> = {}) => {
    const prisma: PrismaStub = {
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      eventOutbox: {
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<Promise<{ count: number }>, [unknown?]>().mockResolvedValue(
          { count: 1 },
        ),
        findMany: mockFn<Promise<EventOutbox[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(0),
      },
      ...overrides,
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };
    const worker = new OutboxDispatcherWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      new AppConfigService(),
    );
    return { worker, prisma, metrics };
  };

  it('marks event as sent when webhook is not configured', async () => {
    const { worker, prisma } = makeWorker({
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({
          webhookUrl: null,
          webhookSecret: null,
        }),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    });

    const row = {
      id: 'e1',
      merchantId: 'm1',
      eventType: 'receipt.created',
      payload: { ok: true },
      retries: 0,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EventOutbox;

    await asPrivateWorker(worker).send(row);

    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e1' },
        data: expect.objectContaining({
          status: 'SENT',
          lastError: 'Webhook not configured',
        }),
      }),
    );
  });

  it('schedules retry when webhook url is invalid', async () => {
    process.env.OUTBOX_MAX_RETRIES = '2';
    const { worker, prisma } = makeWorker({
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({
          webhookUrl: 'http://example.com/hook',
          webhookSecret: 'secret',
        }),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    });

    const row = {
      id: 'e2',
      merchantId: 'm1',
      eventType: 'receipt.created',
      payload: { ok: true },
      retries: 0,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EventOutbox;

    await asPrivateWorker(worker).send(row);

    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e2' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastError: 'Webhook URL must use https',
        }),
      }),
    );
  });

  it('sends event when webhook responds ok', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValue(makeResponse(200, 'ok'));
    (recordExternalRequest as jest.Mock).mockImplementation(() => undefined);
    (readResponseTextSafe as jest.Mock).mockResolvedValue('');
    const { worker, prisma } = makeWorker({
      merchantSettings: {
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({
          webhookUrl: 'https://example.com/hook',
          webhookSecret: 'secret',
          webhookKeyId: 'k1',
        }),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    });

    const row = {
      id: 'e3',
      merchantId: 'm1',
      eventType: 'receipt.created',
      payload: { ok: true },
      retries: 0,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EventOutbox;

    await asPrivateWorker(worker).send(row);

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e3' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('reschedules events when circuit breaker is open', async () => {
    const { worker, prisma } = makeWorker({
      eventOutbox: {
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<
          Promise<{ count: number }>,
          [unknown?]
        >().mockResolvedValue({ count: 0 }),
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(1),
        findMany: mockFn<Promise<EventOutbox[]>, [unknown?]>().mockResolvedValue(
          [
            {
              id: 'e4',
              merchantId: 'm1',
              eventType: 'receipt.created',
              payload: { ok: true },
              retries: 0,
              status: 'PENDING',
              createdAt: new Date(),
              updatedAt: new Date(),
            } as EventOutbox,
          ],
        ),
      },
    });

    const privateWorker = worker as unknown as {
      cb: Map<string, { fails: number; windowStart: number; openUntil: number }>;
      tick: () => Promise<void>;
    };
    privateWorker.cb.set('m1', {
      fails: 0,
      windowStart: Date.now(),
      openUntil: Date.now() + 60_000,
    });

    const sendSpy = jest
      .spyOn(worker as unknown as { send: (row: EventOutbox) => Promise<void> }, 'send')
      .mockResolvedValue();

    await privateWorker.tick();

    expect(sendSpy).not.toHaveBeenCalled();
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'e4' },
        data: expect.objectContaining({
          status: 'PENDING',
          lastError: 'circuit open',
        }),
      }),
    );
  });
});
