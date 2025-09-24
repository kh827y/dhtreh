import { CustomThrottlerGuard } from './custom-throttler.guard';

describe('CustomThrottlerGuard.getTracker', () => {
  it('combines ip, path, merchantId, deviceId, staffId', async () => {
    const g = new CustomThrottlerGuard({} as any, {} as any, {} as any);
    const req: any = {
      ip: '127.0.0.1',
      route: { path: '/loyalty/commit' },
      body: { merchantId: 'M-1', deviceId: 'D-1', staffId: 'S-1' },
      query: {},
    };
    const key = await (g as any).getTracker(req);
    expect(key).toContain('127.0.0.1');
    expect(key).toContain('/loyalty/commit');
    expect(key).toContain('M-1');
    expect(key).toContain('D-1');
    expect(key).toContain('S-1');
  });
});

