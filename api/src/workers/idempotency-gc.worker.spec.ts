import { IdempotencyGcWorker } from './idempotency-gc.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import { AppConfigService } from '../core/config/app-config.service';
import * as lockUtil from '../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  idempotencyKey: {
    deleteMany: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type WorkerPrivate = {
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateWorker = (worker: IdempotencyGcWorker) =>
  worker as unknown as WorkerPrivate;

describe('IdempotencyGcWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    process.env.IDEMPOTENCY_TTL_HOURS = '72';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('removes expired idempotency keys when lock is acquired', async () => {
    const prisma: PrismaStub = {
      idempotencyKey: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new IdempotencyGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await asPrivateWorker(worker).tick();

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('skips cleanup when lock is not acquired', async () => {
    const prisma: PrismaStub = {
      idempotencyKey: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new IdempotencyGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await asPrivateWorker(worker).tick();

    expect(prisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
  });
});
