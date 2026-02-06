import { DataImportStatus, DataImportType } from '@prisma/client';
import { DataImportWorker } from './data-import.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { ImportExportService } from '../modules/import-export/import-export.service';
import { AppConfigService } from '../core/config/app-config.service';
import * as lockUtil from '../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  dataImportJob: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
    findFirst: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type ImporterStub = {
  processImportJob: MockFn<Promise<unknown>, [string]>;
};

type WorkerPrivate = {
  tick: () => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asImporterService = (stub: ImporterStub) =>
  stub as unknown as ImportExportService;
const asPrivateWorker = (worker: DataImportWorker) =>
  worker as unknown as WorkerPrivate;

describe('DataImportWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  const makeWorker = (overrides?: Partial<PrismaStub>) => {
    const prisma: PrismaStub = {
      dataImportJob: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(null),
      },
      ...overrides,
    };
    const importer: ImporterStub = {
      processImportJob: mockFn<Promise<unknown>, [string]>().mockResolvedValue(
        undefined,
      ),
    };
    const worker = new DataImportWorker(
      asPrismaService(prisma),
      asImporterService(importer),
      new AppConfigService(),
    );
    return { worker, prisma, importer };
  };

  it('requeues stale jobs when DATA_IMPORT_RETRY_STALE is enabled', async () => {
    process.env.DATA_IMPORT_RETRY_STALE = '1';
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);
    const { worker, prisma } = makeWorker({
      dataImportJob: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          {
            id: 'job-1',
            merchantId: 'm1',
            startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(null),
      },
    });

    await asPrivateWorker(worker).tick();

    expect(prisma.dataImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: DataImportStatus.UPLOADED,
          startedAt: null,
        }),
      }),
    );
  });

  it('marks stale jobs as failed when DATA_IMPORT_RETRY_STALE is disabled', async () => {
    process.env.DATA_IMPORT_RETRY_STALE = '0';
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);
    const { worker, prisma } = makeWorker({
      dataImportJob: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          {
            id: 'job-2',
            merchantId: 'm1',
            startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
        ]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue(null),
      },
    });

    await asPrivateWorker(worker).tick();

    expect(prisma.dataImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-2' },
        data: expect.objectContaining({
          status: DataImportStatus.FAILED,
        }),
      }),
    );
  });

  it('processes uploaded customers import when lock is acquired', async () => {
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
    const { worker, prisma, importer } = makeWorker({
      dataImportJob: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
        findFirst: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({
          id: 'job-3',
          type: DataImportType.CUSTOMERS,
          status: DataImportStatus.UPLOADED,
        }),
      },
    });

    await asPrivateWorker(worker).tick();

    expect(importer.processImportJob).toHaveBeenCalledWith('job-3');
    expect(prisma.dataImportJob.findFirst).toHaveBeenCalled();
    expect(lockUtil.pgAdvisoryUnlock).toHaveBeenCalledWith(
      expect.anything(),
      [1, 2],
    );
  });
});
