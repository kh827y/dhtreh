import { AutoReturnWorker } from './auto-return.worker';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { PushService } from '../modules/notifications/push/push.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type ParsedConfig = {
  giftPoints: number;
  giftTtlDays: number;
  repeatEnabled: boolean;
  repeatDays: number;
};
type AutoReturnWorkerPrivate = {
  parseConfig: (rules: unknown) => ParsedConfig | null;
  applyPlaceholders: (template: string, data: Record<string, string>) => string;
};
type MetricsStub = { inc: MockFn };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: object) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPushService = (stub: PushService) => stub as unknown as PushService;
const asPrivateWorker = (worker: AutoReturnWorker) =>
  worker as unknown as AutoReturnWorkerPrivate;

describe('AutoReturnWorker helpers', () => {
  function createWorker() {
    const prisma = {};
    const metrics: MetricsStub = { inc: mockFn() };
    const push = {} as PushService;
    return new AutoReturnWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPushService(push),
    );
  }

  it('отключает подарочные поля, когда giftEnabled=false', () => {
    const worker = createWorker();
    const workerPrivate = asPrivateWorker(worker);
    const config = workerPrivate.parseConfig({
      autoReturn: {
        enabled: true,
        days: 10,
        text: 'Test',
        giftEnabled: false,
        giftPoints: 500,
        giftTtlDays: 7,
      },
    });

    expect(config).not.toBeNull();
    expect(config?.giftPoints).toBe(0);
    expect(config?.giftTtlDays).toBe(0);
  });

  it('читает настройки повтора из вложенного объекта', () => {
    const worker = createWorker();
    const workerPrivate = asPrivateWorker(worker);
    const config = workerPrivate.parseConfig({
      autoReturn: {
        enabled: true,
        days: 10,
        text: 'Test',
        repeat: { enabled: true, days: 5 },
      },
    });

    expect(config).not.toBeNull();
    expect(config?.repeatEnabled).toBe(true);
    expect(config?.repeatDays).toBe(5);
  });

  it('подставляет плейсхолдеры с запасным обращением', () => {
    const worker = createWorker();
    const workerPrivate = asPrivateWorker(worker);
    const template = 'Привет, %username%! Вам начислено %bonus% баллов.';

    const rendered = workerPrivate.applyPlaceholders(template, {
      username: '',
      bonus: '',
    });

    expect(rendered).toBe('Привет, Уважаемый клиент! Вам начислено  баллов.');
  });
});
