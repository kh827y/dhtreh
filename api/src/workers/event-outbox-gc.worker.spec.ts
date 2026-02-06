import { EventOutboxGcWorker } from './event-outbox-gc.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import { AppConfigService } from '../core/config/app-config.service';
import * as lockUtil from '../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  eventOutbox: {
    deleteMany: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type WorkerPrivate = {
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateWorker = (worker: EventOutboxGcWorker) =>
  worker as unknown as WorkerPrivate;

describe('EventOutboxGcWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    process.env.OUTBOX_RETENTION_DAYS = '7';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('deletes old SENT/DEAD outbox rows when lock is acquired', async () => {
    const prisma: PrismaStub = {
      eventOutbox: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new EventOutboxGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await asPrivateWorker(worker).tick();

    expect(prisma.eventOutbox.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['SENT', 'DEAD'] },
        }),
      }),
    );
  });

  it('skips deleteMany when advisory lock is not acquired', async () => {
    const prisma: PrismaStub = {
      eventOutbox: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new EventOutboxGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await asPrivateWorker(worker).tick();

    expect(prisma.eventOutbox.deleteMany).not.toHaveBeenCalled();
  });
});
