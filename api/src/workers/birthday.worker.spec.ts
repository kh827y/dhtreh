import { BirthdayWorker } from './birthday.worker';
import {
  DEFAULT_TIMEZONE_CODE,
  findTimezone,
} from '../shared/timezone/russia-timezones';
import { AppConfigService } from '../core/config/app-config.service';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { PushService } from '../modules/notifications/push/push.service';
import type { RussiaTimezone } from '../shared/timezone/russia-timezones';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MockModel = Record<string, MockFn>;
type PrismaStub = Record<string, MockModel | MockFn | undefined>;
type MetricsStub = Pick<MetricsService, 'inc'>;
type PushStub = Record<string, unknown>;
type BirthdayConfig = {
  enabled: boolean;
  daysBefore: number;
  onlyBuyers: boolean;
  text: string;
  giftPoints: number;
  giftTtlDays: number;
};
type MerchantContext = {
  id: string;
  name: string;
  config: BirthdayConfig;
  timezone: RussiaTimezone;
};
type BirthdayWorkerPrivate = {
  startOfDayInTimezone(date: Date, timezone: RussiaTimezone): Date;
  resolveBirthdayEvent(
    birthDate: Date,
    config: BirthdayConfig,
    target: Date,
    timezone: RussiaTimezone,
  ): Date | null;
  applyPlaceholders(
    template: string,
    payload: { username?: string; bonus?: string },
  ): string;
  collectCandidates(
    merchant: MerchantContext,
    target: Date,
  ): Promise<Array<{ customerId: string }>>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: Record<string, unknown>) =>
  stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPushService = (stub: PushStub) => stub as unknown as PushService;

describe('BirthdayWorker helpers', () => {
  function createWorker() {
    const prisma: PrismaStub = {};
    const metrics: MetricsStub = { inc: mockFn() };
    const push: PushStub = {};
    return new BirthdayWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPushService(push),
      new AppConfigService(),
    );
  }

  function buildConfig(
    overrides: Partial<BirthdayConfig> = {},
  ): BirthdayConfig {
    return {
      enabled: true,
      daysBefore: 5,
      onlyBuyers: false,
      text: 'Привет, %username%! %bonus%',
      giftPoints: 100,
      giftTtlDays: 0,
      ...overrides,
    };
  }

  function toLocalDate(date: Date, timezone: RussiaTimezone) {
    const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
    return new Date(date.getTime() + offsetMs);
  }

  it('computes upcoming birthday within the same year', () => {
    const worker = createWorker();
    const workerPrivate = worker as unknown as BirthdayWorkerPrivate;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig();
    const target = workerPrivate.startOfDayInTimezone(
      new Date(2025, 5, 10, 12),
      timezone,
    );
    const birthDate = new Date(1990, 5, 15);

    const actual = workerPrivate.resolveBirthdayEvent(
      birthDate,
      config,
      target,
      timezone,
    );

    expect(actual).not.toBeNull();
    const local = toLocalDate(actual as Date, timezone);
    expect(local.getUTCFullYear()).toBe(2025);
    expect(local.getUTCMonth()).toBe(5); // June
    expect(local.getUTCDate()).toBe(15);
  });

  it('handles cross-year greetings (daysBefore spills into previous year)', () => {
    const worker = createWorker();
    const workerPrivate = worker as unknown as BirthdayWorkerPrivate;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig({ daysBefore: 7 });
    const target = workerPrivate.startOfDayInTimezone(
      new Date(2024, 11, 25, 12),
      timezone,
    );
    const birthDate = new Date(1990, 0, 1);

    const actual = workerPrivate.resolveBirthdayEvent(
      birthDate,
      config,
      target,
      timezone,
    );

    expect(actual).not.toBeNull();
    const local = toLocalDate(actual as Date, timezone);
    expect(local.getUTCFullYear()).toBe(2025);
    expect(local.getUTCMonth()).toBe(0); // January
    expect(local.getUTCDate()).toBe(1);
  });

  it('maps leap-day birthdays to Feb 28 in non-leap years when needed', () => {
    const worker = createWorker();
    const workerPrivate = worker as unknown as BirthdayWorkerPrivate;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig({ daysBefore: 0 });
    const target = workerPrivate.startOfDayInTimezone(
      new Date(2025, 1, 28, 12),
      timezone,
    );
    const birthDate = new Date(2000, 1, 29);

    const actual = workerPrivate.resolveBirthdayEvent(
      birthDate,
      config,
      target,
      timezone,
    );

    expect(actual).not.toBeNull();
    const local = toLocalDate(actual as Date, timezone);
    expect(local.getUTCFullYear()).toBe(2025);
    expect(local.getUTCMonth()).toBe(1); // February
    expect(local.getUTCDate()).toBe(28);
  });

  it('applies placeholders with fallback name and bonus', () => {
    const worker = createWorker();
    const workerPrivate = worker as unknown as BirthdayWorkerPrivate;
    const template = 'Привет, %username%! Вам начислено %bonus% баллов.';

    const renderedWithName = workerPrivate.applyPlaceholders(template, {
      username: 'Анна',
      bonus: '200',
    });
    expect(renderedWithName).toBe('Привет, Анна! Вам начислено 200 баллов.');

    const renderedFallback = workerPrivate.applyPlaceholders(template, {
      username: '',
      bonus: '',
    });
    expect(renderedFallback).toBe(
      'Привет, Уважаемый клиент! Вам начислено  баллов.',
    );
  });

  it('отбирает кандидатов по покупкам при onlyBuyers=true', async () => {
    const prisma = {
      customer: { findMany: mockFn() },
      receipt: { findMany: mockFn() },
    } satisfies { customer: MockModel; receipt: MockModel };
    const metrics: MetricsStub = { inc: mockFn() };
    const push: PushStub = {};
    const worker = new BirthdayWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPushService(push),
      new AppConfigService(),
    );
    const workerPrivate = worker as unknown as BirthdayWorkerPrivate;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);

    const merchant: MerchantContext = {
      id: 'm1',
      name: 'Test',
      config: {
        enabled: true,
        daysBefore: 0,
        onlyBuyers: true,
        text: 'Hi',
        giftPoints: 0,
        giftTtlDays: 0,
      },
      timezone,
    };

    prisma.customer.findMany.mockResolvedValue([
      { id: 'c1', name: 'Аня', birthday: new Date('1990-01-10') },
      { id: 'c2', name: 'Борис', birthday: new Date('1990-01-10') },
    ]);
    prisma.receipt.findMany.mockResolvedValue([{ customerId: 'c2' }]);

    const target = workerPrivate.startOfDayInTimezone(
      new Date('2025-01-10T10:00:00.000Z'),
      timezone,
    );

    const candidates = await workerPrivate.collectCandidates(merchant, target);

    expect(candidates.map((item) => item.customerId)).toEqual(['c2']);
  });
});
