import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerRequest,
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
  method?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
  portalMerchantId?: string;
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

describe('CustomThrottlerGuard.handleRequest (portal profile)', () => {
  const setEnv = (key: string, value: string) => {
    process.env[key] = value;
  };
  const clearEnv = (key: string) => {
    delete process.env[key];
  };
  const withGuardCall = async (
    req: RequestLike,
    env: Record<string, string>,
  ) => {
    const keys = Object.keys(env);
    keys.forEach((key) => setEnv(key, env[key]));
    const superSpy = jest
      .spyOn(ThrottlerGuard.prototype as any, 'handleRequest')
      .mockResolvedValue(true);
    try {
      const guard = buildGuard();
      const requestProps = {
        context: {
          switchToHttp: () => ({ getRequest: () => req }),
        },
        limit: 200,
        ttl: 60_000,
      } as unknown as ThrottlerRequest;
      const result = await (
        guard as unknown as {
          handleRequest: (props: ThrottlerRequest) => Promise<boolean>;
        }
      ).handleRequest(requestProps);
      const forwarded = superSpy.mock.calls.at(-1)?.[0] as ThrottlerRequest;
      return { result, forwarded };
    } finally {
      superSpy.mockRestore();
      keys.forEach(clearEnv);
    }
  };

  it('применяет повышенный лимит для portal analytics read', async () => {
    const { result, forwarded } = await withGuardCall(
      {
        method: 'GET',
        originalUrl: '/api/v1/portal/analytics/dashboard?period=month',
        portalMerchantId: 'm-1',
      },
      {
        RL_LIMIT_PORTAL_READ: '600',
        RL_TTL_PORTAL_READ: '60000',
        RL_LIMIT_PORTAL_ANALYTICS_READ: '900',
        RL_TTL_PORTAL_ANALYTICS_READ: '45000',
      },
    );
    expect(result).toBe(true);
    expect(forwarded.limit).toBe(900);
    expect(forwarded.ttl).toBe(45_000);
  });

  it('применяет write-профиль для portal POST', async () => {
    const { result, forwarded } = await withGuardCall(
      {
        method: 'POST',
        originalUrl: '/api/v1/portal/settings/name',
        portalMerchantId: 'm-1',
      },
      {
        RL_LIMIT_PORTAL_WRITE: '180',
        RL_TTL_PORTAL_WRITE: '45000',
      },
    );
    expect(result).toBe(true);
    expect(forwarded.limit).toBe(180);
    expect(forwarded.ttl).toBe(45_000);
  });

  it('учитывает RL_MERCHANT_MULTIPLIERS для portal merchant id', async () => {
    const { result, forwarded } = await withGuardCall(
      {
        method: 'GET',
        originalUrl: '/api/v1/portal/me',
        portalMerchantId: 'm-1',
      },
      {
        RL_LIMIT_PORTAL_READ: '300',
        RL_TTL_PORTAL_READ: '60000',
        RL_MERCHANT_MULTIPLIERS: '{"m-1":2}',
      },
    );
    expect(result).toBe(true);
    expect(forwarded.limit).toBe(600);
    expect(forwarded.ttl).toBe(60_000);
  });
});
