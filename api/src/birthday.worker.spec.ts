import { BirthdayWorker } from './birthday.worker';

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
    const config = buildConfig();
    const target = worker.startOfDay(new Date(2025, 5, 10, 12));
    const birthDate = new Date(1990, 5, 15);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target);

    expect(actual).not.toBeNull();
    expect(actual?.getFullYear()).toBe(2025);
    expect(actual?.getMonth()).toBe(5); // June
    expect(actual?.getDate()).toBe(15);
  });

  it('handles cross-year greetings (daysBefore spills into previous year)', () => {
    const worker = createWorker() as any;
    const config = buildConfig({ daysBefore: 7 });
    const target = worker.startOfDay(new Date(2024, 11, 25, 12));
    const birthDate = new Date(1990, 0, 1);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target);

    expect(actual).not.toBeNull();
    expect(actual?.getFullYear()).toBe(2025);
    expect(actual?.getMonth()).toBe(0); // January
    expect(actual?.getDate()).toBe(1);
  });

  it('maps leap-day birthdays to Feb 28 in non-leap years when needed', () => {
    const worker = createWorker() as any;
    const config = buildConfig({ daysBefore: 0 });
    const target = worker.startOfDay(new Date(2025, 1, 28, 12));
    const birthDate = new Date(2000, 1, 29);

    const actual = worker.resolveBirthdayEvent(birthDate, config, target);

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
});
