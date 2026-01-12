import { BirthdayWorker } from './birthday.worker';
import { DEFAULT_TIMEZONE_CODE, findTimezone } from './timezone/russia-timezones';

describe('BirthdayWorker helpers', () => {
  function createWorker() {
    const prisma: any = {};
    const metrics: any = { inc: jest.fn() };
    const push: any = {};
    return new BirthdayWorker(prisma, metrics, push);
  }

  function buildConfig(overrides: Partial<any> = {}) {
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

  it('computes upcoming birthday within the same year', () => {
    const worker = createWorker() as any;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig();
    const target = worker.startOfDayInTimezone(new Date(2025, 5, 10, 12), timezone);
    const birthDate = new Date(1990, 5, 15);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target, timezone);

    expect(actual).not.toBeNull();
    expect(actual?.getFullYear()).toBe(2025);
    expect(actual?.getMonth()).toBe(5); // June
    expect(actual?.getDate()).toBe(15);
  });

  it('handles cross-year greetings (daysBefore spills into previous year)', () => {
    const worker = createWorker() as any;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig({ daysBefore: 7 });
    const target = worker.startOfDayInTimezone(new Date(2024, 11, 25, 12), timezone);
    const birthDate = new Date(1990, 0, 1);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target, timezone);

    expect(actual).not.toBeNull();
    expect(actual?.getFullYear()).toBe(2025);
    expect(actual?.getMonth()).toBe(0); // January
    expect(actual?.getDate()).toBe(1);
  });

  it('maps leap-day birthdays to Feb 28 in non-leap years when needed', () => {
    const worker = createWorker() as any;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);
    const config = buildConfig({ daysBefore: 0 });
    const target = worker.startOfDayInTimezone(new Date(2025, 1, 28, 12), timezone);
    const birthDate = new Date(2000, 1, 29);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target, timezone);

    expect(actual).not.toBeNull();
    expect(actual?.getFullYear()).toBe(2025);
    expect(actual?.getMonth()).toBe(1); // February
    expect(actual?.getDate()).toBe(28);
  });

  it('applies placeholders with fallback name and bonus', () => {
    const worker = createWorker() as any;
    const template = 'Привет, %username%! Вам начислено %bonus% баллов.';

    const renderedWithName = worker.applyPlaceholders(template, {
      username: 'Анна',
      bonus: '200',
    });
    expect(renderedWithName).toBe('Привет, Анна! Вам начислено 200 баллов.');

    const renderedFallback = worker.applyPlaceholders(template, {
      username: '',
      bonus: '',
    });
    expect(renderedFallback).toBe(
      'Привет, Уважаемый клиент! Вам начислено  баллов.',
    );
  });

  it('отбирает кандидатов по покупкам при onlyBuyers=true', async () => {
    const prisma: any = {
      customer: { findMany: jest.fn() },
      receipt: { findMany: jest.fn() },
    };
    const metrics: any = { inc: jest.fn() };
    const push: any = {};
    const worker = new BirthdayWorker(prisma, metrics, push) as any;
    const timezone = findTimezone(DEFAULT_TIMEZONE_CODE);

    const merchant = {
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

    const target = worker.startOfDayInTimezone(
      new Date('2025-01-10T10:00:00.000Z'),
      timezone,
    );

    const candidates = await worker.collectCandidates(merchant, target);

    expect(candidates.map((item: any) => item.customerId)).toEqual(['c2']);
  });
});
