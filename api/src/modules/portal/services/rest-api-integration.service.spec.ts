import { PortalRestApiIntegrationService } from './rest-api-integration.service';
import type { PrismaService } from '../../../core/prisma/prisma.service';
import type { RestApiIntegrationsService } from '../../integrations/rest-api-integrations.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type PrismaStub = {
  integration: {
    findFirst: MockFn<Promise<unknown>, [unknown?]>;
    update: MockFn<Promise<unknown>, [unknown?]>;
    create: MockFn<Promise<unknown>, [unknown?]>;
  };
};
type RestIntegrationsStub = {
  provider: string;
  findByMerchant: MockFn<Promise<unknown>, [string]>;
  normalizeConfig: MockFn<unknown, [unknown]>;
  baseApiUrl: MockFn<string, []>;
  generateApiKey: MockFn<string, []>;
  hashKey: MockFn<string, [string]>;
  maskKey: MockFn<string, [string]>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asRestIntegrationsService = (stub: RestIntegrationsStub) =>
  stub as unknown as RestApiIntegrationsService;

const rateLimits = {
  code: { limit: 60, ttl: 60_000 },
  calculate: { limit: 120, ttl: 60_000 },
  bonus: { limit: 60, ttl: 60_000 },
  refund: { limit: 30, ttl: 60_000 },
};

function createMocks() {
  const prisma: PrismaStub = {
    integration: {
      findFirst: mockFn<Promise<unknown>, [unknown?]>(),
      update: mockFn<Promise<unknown>, [unknown?]>(),
      create: mockFn<Promise<unknown>, [unknown?]>(),
    },
  };

  const restIntegrations: RestIntegrationsStub = {
    provider: 'REST_API',
    findByMerchant: mockFn<Promise<unknown>, [string]>(),
    normalizeConfig: mockFn<unknown, [unknown]>().mockReturnValue({
      rateLimits,
    }),
    baseApiUrl: mockFn<string, []>().mockReturnValue('https://api.example'),
    generateApiKey: mockFn<string, []>().mockReturnValue('rk_test_key'),
    hashKey: mockFn<string, [string]>().mockReturnValue('hash'),
    maskKey: mockFn<string, [string]>().mockReturnValue('rk_****'),
  };

  const service = new PortalRestApiIntegrationService(
    asPrismaService(prisma),
    asRestIntegrationsService(restIntegrations),
  );

  return { prisma, restIntegrations, service };
}

describe('PortalRestApiIntegrationService', () => {
  it('возвращает базовый URL и список эндпоинтов', async () => {
    const { service, restIntegrations } = createMocks();
    restIntegrations.findByMerchant.mockResolvedValue({
      id: 'INT-1',
      apiKeyHash: 'hash',
      apiKeyMask: 'rk_****',
      isActive: true,
      archivedAt: null,
      config: {},
      apiKeyCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const state = await service.getState('M-1');

    expect(state.enabled).toBe(true);
    expect(state.baseUrl).toBe('https://api.example');
    expect(state.availableEndpoints[0]).toBe(
      'https://api.example/api/integrations/code',
    );
    expect(state.rateLimits.code.limit).toBe(60);
  });

  it('выдаёт новый ключ и обновляет интеграцию', async () => {
    const { service, restIntegrations, prisma } = createMocks();
    restIntegrations.findByMerchant.mockResolvedValue({
      id: 'INT-2',
      config: {},
      credentials: { apiKeyMask: 'old' },
    });

    const response = await service.issueKey('M-2');

    expect(response.apiKey).toBe('rk_test_key');
    expect(response.message).toContain('Новый API-ключ');
    expect(prisma.integration.update).toHaveBeenCalled();
  });

  it('деактивирует интеграцию и сбрасывает ключ', async () => {
    const { service, restIntegrations, prisma } = createMocks();
    const existing = {
      id: 'INT-3',
      config: {},
      credentials: { apiKeyMask: 'old' },
      apiKeyHash: 'hash',
      apiKeyMask: 'rk_****',
      isActive: true,
      archivedAt: null,
    };
    restIntegrations.findByMerchant
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({
        ...existing,
        isActive: false,
        apiKeyHash: null,
        apiKeyMask: null,
        archivedAt: new Date('2024-02-01T00:00:00.000Z'),
      });

    const response = await service.disable('M-3');

    expect(prisma.integration.update).toHaveBeenCalled();
    expect(response.message).toBe('Интеграция отключена');
    expect(response.enabled).toBe(false);
  });
});
