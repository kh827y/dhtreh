import { TelegramStaffDigestWorker } from './staff-digest.worker';
import type { PrismaService } from '../../core/prisma/prisma.service';
import type { TelegramStaffNotificationsService } from './staff-notifications.service';
import { AppConfigService } from '../../core/config/app-config.service';
import * as lockUtil from '../../shared/pg-lock.util';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  telegramStaffSubscriber: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
  };
  merchantSettings: {
    findMany: MockFn<Promise<unknown[]>, [unknown?]>;
    upsert: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type StaffNotifyStub = {
  enqueueEvent: MockFn<Promise<unknown>, [string, Record<string, unknown>]>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asStaffNotify = (stub: StaffNotifyStub) =>
  stub as unknown as TelegramStaffNotificationsService;

describe('TelegramStaffDigestWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('enqueues digest once per local day when lock is acquired', async () => {
    const prisma: PrismaStub = {
      telegramStaffSubscriber: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { merchantId: 'm1' },
        ]),
      },
      merchantSettings: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { merchantId: 'm1', rulesJson: {}, timezone: 'MSK+0' },
        ]),
        upsert: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const staffNotify: StaffNotifyStub = {
      enqueueEvent: mockFn<
        Promise<unknown>,
        [string, Record<string, unknown>]
      >().mockResolvedValue(undefined),
    };
    const worker = new TelegramStaffDigestWorker(
      asPrismaService(prisma),
      asStaffNotify(staffNotify),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] } as const);
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);

    await worker.handleDailyDigest();

    expect(staffNotify.enqueueEvent).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ kind: 'DIGEST' }),
    );
    expect(prisma.merchantSettings.upsert).toHaveBeenCalled();
  });

  it('skips digest run when advisory lock is not acquired', async () => {
    const prisma: PrismaStub = {
      telegramStaffSubscriber: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([
          { merchantId: 'm1' },
        ]),
      },
      merchantSettings: {
        findMany: mockFn<Promise<unknown[]>, [unknown?]>().mockResolvedValue([]),
        upsert: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const staffNotify: StaffNotifyStub = {
      enqueueEvent: mockFn<
        Promise<unknown>,
        [string, Record<string, unknown>]
      >().mockResolvedValue(undefined),
    };
    const worker = new TelegramStaffDigestWorker(
      asPrismaService(prisma),
      asStaffNotify(staffNotify),
      new AppConfigService(),
    );
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: false, key: [1, 2] } as const);

    await worker.handleDailyDigest();

    expect(prisma.telegramStaffSubscriber.findMany).not.toHaveBeenCalled();
    expect(staffNotify.enqueueEvent).not.toHaveBeenCalled();
  });
});
