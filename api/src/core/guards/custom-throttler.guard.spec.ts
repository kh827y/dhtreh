import { Reflector } from '@nestjs/core';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { CustomThrottlerGuard } from './custom-throttler.guard';
import { AppConfigService } from '../config/app-config.service';

type ThrottlerStorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};
type RequestLike = {
  ip?: string;
  route?: { path?: string };
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};
type GuardPrivate = { getTracker: (req: RequestLike) => Promise<string> };

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrivateGuard = (guard: CustomThrottlerGuard) =>
  guard as unknown as GuardPrivate;
const buildGuard = () => {
  const options: ThrottlerModuleOptions = {
    throttlers: [{ limit: 10, ttl: 60 }],
  };
  const storage: ThrottlerStorage = {
    increment: mockFn<
      Promise<ThrottlerStorageRecord>,
      [string, number, number, number, string]
    >().mockResolvedValue({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  };
  return new CustomThrottlerGuard(
    options,
    storage,
    new Reflector(),
    new AppConfigService(),
  );
};

describe('CustomThrottlerGuard.getTracker', () => {
  it('включает outletId в ключ троттлинга', async () => {
    const guard = buildGuard();
    const req: RequestLike = {
      ip: '127.0.0.1',
      route: { path: '/loyalty/commit' },
      body: { merchantId: 'M-1', outletId: 'O-1', staffId: 'S-1' },
      query: {},
    };
    const key = await asPrivateGuard(guard).getTracker(req);
    const parts = key.split('|');
    expect(parts).toContain('O-1');
    expect(parts).not.toContain('undefined');
  });

  it('использует staffId, если outletId отсутствует', async () => {
    const guard = buildGuard();
    const req: RequestLike = {
      ip: '10.0.0.1',
      route: { path: '/loyalty/refund' },
      body: { merchantId: 'M-2', staffId: 'S-2' },
      query: {},
    };
    const key = await asPrivateGuard(guard).getTracker(req);
    const parts = key.split('|');
    expect(parts).toContain('M-2');
    expect(parts).toContain('S-2');
    expect(parts).not.toContain('undefined');
  });
});
