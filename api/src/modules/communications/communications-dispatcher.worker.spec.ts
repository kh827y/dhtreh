import { CommunicationsDispatcherWorker } from './communications-dispatcher.worker';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { CommunicationChannel } from '@prisma/client';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  communicationTask: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
    updateMany: MockFn<Promise<{ count: number }>, [unknown?]>;
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
  };
  communicationTaskRecipient: {
    count: MockFn<Promise<number>, [unknown?]>;
    createMany: MockFn<Promise<unknown>, [unknown?]>;
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
    groupBy: MockFn<Promise<unknown[]>, [unknown?]>;
  };
  customer: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
  };
  customerSegment: {
    findFirst: MockFn<Promise<unknown>, [unknown?]>;
  };
  segmentCustomer: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
  };
  loyaltyPromotion: {
    findFirst: MockFn<Promise<unknown>, [unknown?]>;
  };
  communicationAsset: {
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type MetricsStub = { inc: MockFn };
type TelegramStub = {
  sendCampaignMessage: MockFn<Promise<void>, [string, string, unknown]>;
  sendPushNotification: MockFn<Promise<void>, [string, string, unknown]>;
};

type WorkerPrivate = {
  recoverStaleTasks: () => Promise<void>;
  requeueFailedTasks: () => Promise<void>;
  processTelegramTask: (task: unknown) => Promise<void>;
  processPushTask: (task: unknown) => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asTelegramService = (stub: TelegramStub) =>
  stub as unknown as TelegramBotService;
const asPrivateWorker = (worker: CommunicationsDispatcherWorker) =>
  worker as unknown as WorkerPrivate;

describe('CommunicationsDispatcherWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  const makeWorker = (overrides: Partial<PrismaStub> = {}) => {
    const prisma: PrismaStub = {
      communicationTask: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<
          Promise<{ count: number }>,
          [unknown?]
        >().mockResolvedValue({ count: 1 }),
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
      communicationTaskRecipient: {
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(0),
        createMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          {},
        ),
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        groupBy: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
      },
      customer: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
      },
      customerSegment: {
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
      segmentCustomer: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue(
          [],
        ),
      },
      loyaltyPromotion: {
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
      communicationAsset: {
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
      ...overrides,
    };
    const metrics: MetricsStub = { inc: mockFn() };
    const telegram: TelegramStub = {
      sendCampaignMessage: mockFn<
        Promise<void>,
        [string, string, unknown]
      >().mockResolvedValue(undefined),
      sendPushNotification: mockFn<
        Promise<void>,
        [string, string, unknown]
      >().mockResolvedValue(undefined),
    };
    const worker = new CommunicationsDispatcherWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asTelegramService(telegram),
      new AppConfigService(),
    );
    return { worker, prisma, metrics, telegram };
  };

  it('requeues stale tasks within retry budget', async () => {
    process.env.COMM_TASK_STALE_MS = '60000';
    process.env.COMM_TASK_MAX_RETRIES = '2';
    process.env.COMM_TASK_RETRY_DELAY_MS = '60000';

    const { worker, prisma } = makeWorker({
      communicationTask: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 't1', stats: { attempts: 1 } },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<
          Promise<{ count: number }>,
          [unknown?]
        >().mockResolvedValue({ count: 1 }),
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
    });

    await asPrivateWorker(worker).recoverStaleTasks();

    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't1' },
        data: objectContaining({ status: 'SCHEDULED', startedAt: null }),
      }),
    );
  });

  it('marks stale tasks as failed when retries exceeded', async () => {
    process.env.COMM_TASK_STALE_MS = '60000';
    process.env.COMM_TASK_MAX_RETRIES = '1';

    const { worker, prisma } = makeWorker({
      communicationTask: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 't2', stats: { attempts: 1 } },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<
          Promise<{ count: number }>,
          [unknown?]
        >().mockResolvedValue({ count: 1 }),
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
    });

    await asPrivateWorker(worker).recoverStaleTasks();

    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't2' },
        data: objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('requeues failed tasks when retry budget allows', async () => {
    process.env.COMM_TASK_MAX_RETRIES = '2';
    process.env.COMM_TASK_RETRY_DELAY_MS = '60000';

    const { worker, prisma } = makeWorker({
      communicationTask: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 't3', stats: { attempts: 0 } },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        updateMany: mockFn<
          Promise<{ count: number }>,
          [unknown?]
        >().mockResolvedValue({ count: 1 }),
        findUnique: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          null,
        ),
      },
    });

    await asPrivateWorker(worker).requeueFailedTasks();

    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't3' },
        data: objectContaining({ status: 'SCHEDULED', startedAt: null }),
      }),
    );
  });

  it('sends telegram campaign and marks task completed', async () => {
    const { worker, prisma, telegram } = makeWorker({
      customer: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'c1', tgId: '123', name: 'Ivan' },
        ]),
      },
      communicationTaskRecipient: {
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(0),
        createMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          {},
        ),
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          {
            id: 'r1',
            customerId: 'c1',
            status: 'PENDING',
            metadata: {},
            createdAt: new Date(),
          },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        groupBy: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { status: 'SENT', _count: { _all: 1 } },
        ]),
      },
    });

    const task = {
      id: 't4',
      merchantId: 'm1',
      channel: CommunicationChannel.TELEGRAM,
      payload: { text: 'Hello {client}' },
      stats: null,
      promotionId: null,
      media: null,
      audienceId: null,
    };

    await asPrivateWorker(worker).processTelegramTask(task);

    expect(telegram.sendCampaignMessage).toHaveBeenCalledWith(
      'm1',
      '123',
      objectContaining({ text: 'Hello Ivan' }),
    );
    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't4' },
        data: objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('processes telegram recipients in batches with cursor pagination', async () => {
    process.env.COMM_RECIPIENT_BATCH = '1';
    process.env.COMM_DELIVERY_CONCURRENCY = '1';

    const { worker, prisma, telegram } = makeWorker({
      customer: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'c1', tgId: '111', name: 'Ivan' },
          { id: 'c2', tgId: '222', name: 'Maya' },
        ]),
      },
      communicationTaskRecipient: {
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(0),
        createMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          {},
        ),
        findMany: mockFn<Promise<unknown[]>, [unknown?]>()
          .mockResolvedValueOnce([
            {
              id: 'r1',
              customerId: 'c1',
              status: 'PENDING',
              metadata: {},
              createdAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 'r2',
              customerId: 'c2',
              status: 'PENDING',
              metadata: {},
              createdAt: new Date(),
            },
          ])
          .mockResolvedValueOnce([]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        groupBy: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { status: 'SENT', _count: { _all: 2 } },
        ]),
      },
    });

    const task = {
      id: 't4b',
      merchantId: 'm1',
      channel: CommunicationChannel.TELEGRAM,
      payload: { text: 'Hello {client}' },
      stats: null,
      promotionId: null,
      media: null,
      audienceId: null,
    };

    await asPrivateWorker(worker).processTelegramTask(task);

    expect(telegram.sendCampaignMessage).toHaveBeenCalledTimes(2);
    expect(prisma.communicationTaskRecipient.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.communicationTaskRecipient.findMany).toHaveBeenNthCalledWith(
      1,
      objectContaining({
        where: objectContaining({
          taskId: 't4b',
        }),
        take: 1,
      }),
    );
    expect(prisma.communicationTaskRecipient.findMany).toHaveBeenNthCalledWith(
      2,
      objectContaining({
        where: objectContaining({
          id: { gt: 'r1' },
        }),
        take: 1,
      }),
    );
    expect(worker.lastProgressAt).toBeInstanceOf(Date);
  });

  it('fails telegram task with empty text', async () => {
    const { worker, prisma } = makeWorker();

    const task = {
      id: 't5',
      merchantId: 'm1',
      channel: CommunicationChannel.TELEGRAM,
      payload: { text: ' ' },
      stats: null,
      promotionId: null,
      media: null,
      audienceId: null,
    };

    await asPrivateWorker(worker).processTelegramTask(task);

    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't5' },
        data: objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('sends push notification via telegram worker', async () => {
    const { worker, prisma, telegram } = makeWorker({
      customer: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'c2', tgId: '555', name: 'Maya' },
        ]),
      },
      communicationTaskRecipient: {
        count: mockFn<Promise<number>, [unknown?]>().mockResolvedValue(0),
        createMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(
          {},
        ),
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          {
            id: 'r2',
            customerId: 'c2',
            status: 'PENDING',
            metadata: {},
            createdAt: new Date(),
          },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        groupBy: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { status: 'SENT', _count: { _all: 1 } },
        ]),
      },
    });

    const task = {
      id: 't6',
      merchantId: 'm1',
      channel: CommunicationChannel.PUSH,
      payload: { text: 'Push {client}', title: 'Hi {client}' },
      stats: null,
      promotionId: null,
      media: null,
      audienceId: null,
    };

    await asPrivateWorker(worker).processPushTask(task);

    expect(telegram.sendPushNotification).toHaveBeenCalledWith(
      'm1',
      '555',
      objectContaining({ body: 'Push Maya', title: 'Hi Maya' }),
    );
    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: 't6' },
        data: objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
