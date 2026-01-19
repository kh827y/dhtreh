import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TelegramMiniappGuard } from './telegram-miniapp.guard';
import * as telegramHelper from '../../modules/loyalty/telegram-auth.helper';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelegramAuthContext } from '../../modules/loyalty/telegram-auth.helper';

jest.mock('../../modules/loyalty/telegram-auth.helper', () => ({
  readTelegramInitDataFromHeader: jest.fn(),
  resolveTelegramAuthContext: jest.fn(),
}));

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type CustomerRecord = { merchantId: string };
type PrismaStub = {
  customer: { findUnique: MockFn<Promise<CustomerRecord | null>, [unknown]> };
};
type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  teleauth?: Partial<TelegramAuthContext> | null;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const createContext = (req: RequestLike): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as ExecutionContext;
const buildGuard = (overrides: Partial<PrismaStub> = {}) => {
  const prisma: PrismaStub = {
    customer: {
      findUnique: mockFn<
        Promise<CustomerRecord | null>,
        [unknown]
      >().mockResolvedValue(null),
    },
    ...overrides,
  };
  return new TelegramMiniappGuard(asPrismaService(prisma));
};

describe('TelegramMiniappGuard', () => {
  const readInitData =
    telegramHelper.readTelegramInitDataFromHeader as jest.MockedFunction<
      typeof telegramHelper.readTelegramInitDataFromHeader
    >;
  const resolveAuth =
    telegramHelper.resolveTelegramAuthContext as jest.MockedFunction<
      typeof telegramHelper.resolveTelegramAuthContext
    >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('пропускает запрос при наличии teleauth', async () => {
    const guard = buildGuard();
    const req: RequestLike = { teleauth: { customerId: 'C-1' } };

    await expect(guard.canActivate(createContext(req))).resolves.toBe(true);
  });

  it('требует merchantId', async () => {
    const guard = buildGuard({
      customer: {
        findUnique: mockFn<
          Promise<CustomerRecord | null>,
          [unknown]
        >().mockResolvedValue(null),
      },
    });
    const req: RequestLike = { headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('требует initData в Authorization', async () => {
    const guard = buildGuard();
    readInitData.mockReturnValue(null);
    const req: RequestLike = { body: { merchantId: 'M-1' }, headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет неверный initData', async () => {
    const guard = buildGuard();
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue(null);
    const req: RequestLike = { body: { merchantId: 'M-1' }, headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('проставляет teleauth и пропускает запрос', async () => {
    const guard = buildGuard();
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue({
      merchantId: 'M-2',
      customerId: 'C-2',
      tgId: 'TG-2',
    });
    const req: RequestLike = {
      body: { merchantId: 'M-2', customerId: 'C-2' },
      headers: {},
    };

    await expect(guard.canActivate(createContext(req))).resolves.toBe(true);
    expect(req.teleauth).toEqual({
      merchantId: 'M-2',
      customerId: 'C-2',
      tgId: 'TG-2',
    });
  });

  it('отклоняет запрос при несовпадении customerId', async () => {
    const guard = buildGuard();
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue({
      merchantId: 'M-3',
      customerId: 'C-3',
      tgId: 'TG-3',
    });
    const req: RequestLike = {
      body: { merchantId: 'M-3', customerId: 'C-999' },
      headers: {},
    };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
