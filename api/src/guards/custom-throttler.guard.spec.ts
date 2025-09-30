import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard.getTracker', () => {
  it('включает outletId в ключ троттлинга', async () => {
    const g = new CustomThrottlerGuard({} as any, {} as any, {} as any);
    const req: any = {
      ip: '127.0.0.1',
      route: { path: '/loyalty/commit' },
      body: { merchantId: 'M-1', outletId: 'O-1', staffId: 'S-1' },
      query: {},
    };
    const key = await (g as any).getTracker(req);
    const parts = key.split('|');
    expect(parts).toContain('O-1');
    expect(parts).not.toContain('undefined');
  });

  it('формирует ключ без outletId, если он отсутствует', async () => {
    const g = new CustomThrottlerGuard({} as any, {} as any, {} as any);
    const req: any = {
      ip: '10.0.0.1',
      route: { path: '/loyalty/refund' },
      body: { merchantId: 'M-2', staffId: 'S-2' },
      query: {},
    };
    const key = await (g as any).getTracker(req);
    const parts = key.split('|');
    expect(parts).toContain('M-2');
    expect(parts).not.toContain('undefined');
  });
});

