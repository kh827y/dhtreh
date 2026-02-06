import { RetentionGcWorker } from './retention-gc.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import { AppConfigService } from '../core/config/app-config.service';
import * as lockUtil from '../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  adminAudit: { deleteMany: MockFn<Promise<unknown>, [unknown?]> };
  syncLog: { deleteMany: MockFn<Promise<unknown>, [unknown?]> };
  communicationTask: { deleteMany: MockFn<Promise<unknown>, [unknown?]> };
};

type WorkerPrivate = {
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asPrivateWorker = (worker: RetentionGcWorker) =>
  worker as unknown as WorkerPrivate;

describe('RetentionGcWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    process.env.ADMIN_AUDIT_RETENTION_DAYS = '30';
    process.env.SYNC_LOG_RETENTION_DAYS = '15';
    process.env.COMMUNICATION_TASK_RETENTION_DAYS = '90';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('applies retention windows when lock is acquired', async () => {
    const prisma: PrismaStub = {
      adminAudit: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      syncLog: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      communicationTask: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new RetentionGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await asPrivateWorker(worker).tick();

    expect(prisma.adminAudit.deleteMany).toHaveBeenCalled();
    expect(prisma.syncLog.deleteMany).toHaveBeenCalled();
    expect(prisma.communicationTask.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['COMPLETED', 'FAILED'] },
        }),
      }),
    );
  });

  it('skips retention cleanup when lock is not acquired', async () => {
    const prisma: PrismaStub = {
      adminAudit: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      syncLog: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      communicationTask: {
        deleteMany: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const worker = new RetentionGcWorker(
      asPrismaService(prisma),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await asPrivateWorker(worker).tick();

    expect(prisma.adminAudit.deleteMany).not.toHaveBeenCalled();
    expect(prisma.syncLog.deleteMany).not.toHaveBeenCalled();
    expect(prisma.communicationTask.deleteMany).not.toHaveBeenCalled();
  });
});
