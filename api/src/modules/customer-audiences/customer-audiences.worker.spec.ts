import { CustomerAudiencesWorker } from './customer-audiences.worker';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { CustomerAudiencesService } from './customer-audiences.service';
import { AppConfigService } from '../../core/config/app-config.service';
import * as lockUtil from '../../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  merchant: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
  customerSegment: { findMany: MockFn<Promise<unknown[]>, [unknown?]> };
};

type AudiencesStub = {
  recalculateSegmentMembership: MockFn<
    Promise<unknown>,
    [string, Record<string, unknown>]
  >;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asAudienceService = (stub: AudiencesStub) =>
  stub as unknown as CustomerAudiencesService;

describe('CustomerAudiencesWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('recalculates all segments for each merchant when lock is acquired', async () => {
    const prisma: PrismaStub = {
      merchant: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'm1' },
          { id: 'm2' },
        ]),
      },
      customerSegment: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>()
          .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }])
          .mockResolvedValueOnce([{ id: 's3' }]),
      },
    };
    const audiences: AudiencesStub = {
      recalculateSegmentMembership: mockFn<
        Promise<unknown>,
        [string, Record<string, unknown>]
      >().mockResolvedValue(undefined),
    };
    const worker = new CustomerAudiencesWorker(
      asPrismaService(prisma),
      asAudienceService(audiences),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await worker.nightlyRecalculate();

    expect(audiences.recalculateSegmentMembership).toHaveBeenCalledTimes(3);
    expect(audiences.recalculateSegmentMembership).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ id: 's1' }),
    );
    expect(audiences.recalculateSegmentMembership).toHaveBeenCalledWith(
      'm2',
      expect.objectContaining({ id: 's3' }),
    );
  });

  it('skips recalculation when lock is not acquired', async () => {
    const prisma: PrismaStub = {
      merchant: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { id: 'm1' },
        ]),
      },
      customerSegment: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
      },
    };
    const audiences: AudiencesStub = {
      recalculateSegmentMembership: mockFn<
        Promise<unknown>,
        [string, Record<string, unknown>]
      >().mockResolvedValue(undefined),
    };
    const worker = new CustomerAudiencesWorker(
      asPrismaService(prisma),
      asAudienceService(audiences),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await worker.nightlyRecalculate();

    expect(prisma.merchant.findMany).not.toHaveBeenCalled();
    expect(audiences.recalculateSegmentMembership).not.toHaveBeenCalled();
  });
});
