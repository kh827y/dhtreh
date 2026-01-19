import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import type { RestApiIntegrationsService } from './rest-api-integrations.service';

type RestIntegrationsMock = {
  findByApiKey: jest.MockedFunction<RestApiIntegrationsService['findByApiKey']>;
  normalizeConfig: jest.MockedFunction<
    RestApiIntegrationsService['normalizeConfig']
  >;
};

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  integrationId?: string;
  integrationMerchantId?: string;
  integrationProvider?: string;
  integrationApiKeyHash?: string;
};

const createContext = (req: RequestLike): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as ExecutionContext;

describe('IntegrationApiKeyGuard', () => {
  let restIntegrations: RestIntegrationsMock;
  let guard: IntegrationApiKeyGuard;
  const now = new Date('2024-01-01T00:00:00.000Z');
  const baseIntegration = {
    id: 'INT-BASE',
    merchantId: 'M-BASE',
    type: 'REST_API',
    provider: 'REST_API',
    config: {},
    credentials: null,
    apiKeyHash: 'hash',
    apiKeyMask: null,
    apiKeyCreatedAt: null,
    archivedAt: null,
    isActive: true,
    lastSync: null,
    errorCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    restIntegrations = {
      findByApiKey: jest.fn(),
      normalizeConfig: jest.fn().mockReturnValue({
        rateLimits: { code: { limit: 1, ttl: 1000 } },
      }),
    };
    guard = new IntegrationApiKeyGuard(
      restIntegrations as unknown as RestApiIntegrationsService,
    );
  });

  it('отклоняет запрос без API-ключа', async () => {
    const req: RequestLike = { headers: {} };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет запрос с невалидным ключом', async () => {
    restIntegrations.findByApiKey.mockResolvedValue(null);
    const req: RequestLike = { headers: { 'x-api-key': 'rk_invalid' } };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('отклоняет отключенную интеграцию', async () => {
    restIntegrations.findByApiKey.mockResolvedValue({
      ...baseIntegration,
      id: 'INT-1',
      merchantId: 'M-1',
      isActive: false,
    });
    const req: RequestLike = { headers: { 'x-api-key': 'rk_test' } };
    await expect(guard.canActivate(createContext(req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('принимает Bearer в Authorization и проставляет контекст интеграции', async () => {
    restIntegrations.findByApiKey.mockResolvedValue({
      ...baseIntegration,
      id: 'INT-2',
      merchantId: 'M-2',
      apiKeyHash: 'hash-2',
    });
    const req: RequestLike = { headers: { authorization: 'Bearer rk_live' } };
    const ok = await guard.canActivate(createContext(req));

    expect(ok).toBe(true);
    expect(req.integrationId).toBe('INT-2');
    expect(req.integrationMerchantId).toBe('M-2');
    expect(req.integrationProvider).toBe('REST_API');
    expect(req.integrationApiKeyHash).toBe('hash-2');
  });
});
