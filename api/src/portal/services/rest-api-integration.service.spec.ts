import { PortalRestApiIntegrationService } from './rest-api-integration.service';

const rateLimits = {
  code: { limit: 60, ttl: 60_000 },
  calculate: { limit: 120, ttl: 60_000 },
  bonus: { limit: 60, ttl: 60_000 },
  refund: { limit: 30, ttl: 60_000 },
  outlets: { limit: 60, ttl: 60_000 },
  devices: { limit: 60, ttl: 60_000 },
  operations: { limit: 30, ttl: 60_000 },
  clientMigrate: { limit: 30, ttl: 60_000 },
};

function createMocks() {
  const prisma = {
    integration: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const restIntegrations = {
    provider: 'REST_API',
    findByMerchant: jest.fn(),
    normalizeConfig: jest.fn().mockReturnValue({
      requireBridgeSignature: true,
      rateLimits,
    }),
    baseApiUrl: jest.fn().mockReturnValue('https://api.example'),
    generateApiKey: jest.fn().mockReturnValue('rk_test_key'),
    hashKey: jest.fn().mockReturnValue('hash'),
    maskKey: jest.fn().mockReturnValue('rk_****'),
  };

  const service = new PortalRestApiIntegrationService(
    prisma as any,
    restIntegrations as any,
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
      config: { requireBridgeSignature: false },
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
