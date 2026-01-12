import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';

type RestIntegrationsMock = {
  findByApiKey: jest.Mock;
  normalizeConfig: jest.Mock;
};

const createContext = (req: any) =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as any;

describe('IntegrationApiKeyGuard', () => {
  let restIntegrations: RestIntegrationsMock;
  let guard: IntegrationApiKeyGuard;

  beforeEach(() => {
    restIntegrations = {
      findByApiKey: jest.fn(),
      normalizeConfig: jest.fn().mockReturnValue({
        rateLimits: { code: { limit: 1, ttl: 1000 } },
      }),
    };
    guard = new IntegrationApiKeyGuard(restIntegrations as any);
  });

  it('отклоняет запрос без API-ключа', async () => {
    const req = { headers: {} };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет запрос с невалидным ключом', async () => {
    restIntegrations.findByApiKey.mockResolvedValue(null);
    const req = { headers: { 'x-api-key': 'rk_invalid' } };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет отключенную интеграцию', async () => {
    restIntegrations.findByApiKey.mockResolvedValue({
      id: 'INT-1',
      merchantId: 'M-1',
      provider: 'REST_API',
      isActive: false,
      archivedAt: null,
      apiKeyHash: 'hash',
      config: {},
    });
    const req = { headers: { 'x-api-key': 'rk_test' } };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('принимает Bearer в Authorization и проставляет контекст интеграции', async () => {
    restIntegrations.findByApiKey.mockResolvedValue({
      id: 'INT-2',
      merchantId: 'M-2',
      provider: 'REST_API',
      isActive: true,
      archivedAt: null,
      apiKeyHash: 'hash-2',
      config: {},
    });
    const req: any = { headers: { authorization: 'Bearer rk_live' } };
    const ok = await guard.canActivate(createContext(req));

    expect(ok).toBe(true);
    expect(req.integrationId).toBe('INT-2');
    expect(req.integrationMerchantId).toBe('M-2');
    expect(req.integrationProvider).toBe('REST_API');
    expect(req.integrationApiKeyHash).toBe('hash-2');
  });
});
