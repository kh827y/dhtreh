import { UnauthorizedException } from '@nestjs/common';
import { TelegramMiniappGuard } from './telegram-miniapp.guard';
import * as telegramHelper from '../loyalty/telegram-auth.helper';

jest.mock('../loyalty/telegram-auth.helper', () => ({
  readTelegramInitDataFromHeader: jest.fn(),
  resolveTelegramAuthContext: jest.fn(),
}));

const createContext = (req: any) =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as any;

describe('TelegramMiniappGuard', () => {
  const readInitData = telegramHelper
    .readTelegramInitDataFromHeader as jest.Mock;
  const resolveAuth = telegramHelper
    .resolveTelegramAuthContext as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('пропускает запрос при наличии teleauth', async () => {
    const guard = new TelegramMiniappGuard({} as any);
    const req = { teleauth: { customerId: 'C-1' } };

    await expect(guard.canActivate(createContext(req))).resolves.toBe(true);
  });

  it('требует merchantId', async () => {
    const guard = new TelegramMiniappGuard({
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any);
    const req = { headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('требует initData в Authorization', async () => {
    const guard = new TelegramMiniappGuard({} as any);
    readInitData.mockReturnValue(null);
    const req = { body: { merchantId: 'M-1' }, headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет неверный initData', async () => {
    const guard = new TelegramMiniappGuard({} as any);
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue(null);
    const req = { body: { merchantId: 'M-1' }, headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('проставляет teleauth и пропускает запрос', async () => {
    const guard = new TelegramMiniappGuard({} as any);
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue({
      merchantId: 'M-2',
      customerId: 'C-2',
      tgId: 'TG-2',
    });
    const req: any = {
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
    const guard = new TelegramMiniappGuard({} as any);
    readInitData.mockReturnValue('initData');
    resolveAuth.mockResolvedValue({
      merchantId: 'M-3',
      customerId: 'C-3',
      tgId: 'TG-3',
    });
    const req = { body: { merchantId: 'M-3', customerId: 'C-999' }, headers: {} };

    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
