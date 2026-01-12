import { AutoReturnWorker } from './auto-return.worker';

describe('AutoReturnWorker helpers', () => {
  function createWorker() {
    const prisma: any = {};
    const metrics: any = { inc: jest.fn() };
    const push: any = {};
    return new AutoReturnWorker(prisma, metrics, push);
  }

  it('отключает подарочные поля, когда giftEnabled=false', () => {
    const worker = createWorker() as any;
    const config = worker.parseConfig({
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
    expect(config.giftPoints).toBe(0);
    expect(config.giftTtlDays).toBe(0);
  });

  it('читает настройки повтора из вложенного объекта', () => {
    const worker = createWorker() as any;
    const config = worker.parseConfig({
      autoReturn: {
        enabled: true,
        days: 10,
        text: 'Test',
        repeat: { enabled: true, days: 5 },
      },
    });

    expect(config).not.toBeNull();
    expect(config.repeatEnabled).toBe(true);
    expect(config.repeatDays).toBe(5);
  });

  it('подставляет плейсхолдеры с запасным обращением', () => {
    const worker = createWorker() as any;
    const template = 'Привет, %username%! Вам начислено %bonus% баллов.';

    const rendered = worker.applyPlaceholders(template, {
      username: '',
      bonus: '',
    });

    expect(rendered).toBe('Привет, Уважаемый клиент! Вам начислено  баллов.');
  });
});
