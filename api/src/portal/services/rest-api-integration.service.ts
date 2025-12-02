import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  RestApiIntegrationsService,
  RestApiRateLimits,
} from '../../integrations/rest-api-integrations.service';

export interface RestApiIntegrationState {
  enabled: boolean;
  status: 'active' | 'disabled';
  integrationId: string | null;
  apiKeyMask: string | null;
  baseUrl: string | null;
  requireBridgeSignature: boolean;
  rateLimits: RestApiRateLimits;
  issuedAt: string | null;
  availableEndpoints: string[];
  message?: string;
}

export interface RestApiIssueResponse extends RestApiIntegrationState {
  apiKey?: string;
}

@Injectable()
export class PortalRestApiIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restIntegrations: RestApiIntegrationsService,
  ) {}

  async getState(merchantId: string): Promise<RestApiIntegrationState> {
    const integration = await this.restIntegrations.findByMerchant(merchantId);
    const config = this.restIntegrations.normalizeConfig(integration?.config);
    const baseUrl = this.restIntegrations.baseApiUrl();
    const keyMask =
      integration?.apiKeyMask ??
      this.extractMaskFromCredentials(integration?.credentials);
    const enabled = Boolean(
      integration?.isActive &&
        !integration?.archivedAt &&
        integration?.apiKeyHash,
    );
    return {
      enabled,
      status: enabled ? 'active' : 'disabled',
      integrationId: integration?.id ?? null,
      apiKeyMask: keyMask || null,
      baseUrl: baseUrl || null,
      requireBridgeSignature: config.requireBridgeSignature,
      rateLimits: config.rateLimits,
      issuedAt: integration?.apiKeyCreatedAt
        ? integration.apiKeyCreatedAt.toISOString()
        : null,
      availableEndpoints: this.buildEndpoints(baseUrl),
    };
  }

  async issueKey(merchantId: string): Promise<RestApiIssueResponse> {
    const apiKey = this.restIntegrations.generateApiKey();
    const hash = this.restIntegrations.hashKey(apiKey);
    const mask = this.restIntegrations.maskKey(apiKey);
    const now = new Date();

    const existing = await this.restIntegrations.findByMerchant(merchantId);
    const normalizedConfig = this.restIntegrations.normalizeConfig(
      existing?.config,
    );
    const preservedConfig =
      existing?.config && typeof existing.config === 'object'
        ? { ...(existing.config as Record<string, any>) }
        : {};
    const configToSave: Prisma.InputJsonValue = {
      ...preservedConfig,
      kind: 'rest-api',
      requireBridgeSignature: normalizedConfig.requireBridgeSignature,
      rateLimits: normalizedConfig.rateLimits,
      lastIssuedAt: now.toISOString(),
    };

    const credentials: Prisma.InputJsonValue = {
      ...(existing?.credentials && typeof existing.credentials === 'object'
        ? (existing.credentials as Record<string, any>)
        : {}),
      apiKeyMask: mask,
      issuedAt: now.toISOString(),
    };

    if (existing) {
      await this.prisma.integration.update({
        where: { id: existing.id },
        data: {
          type: existing.type || 'API',
          config: configToSave,
          credentials,
          apiKeyHash: hash,
          apiKeyMask: mask,
          apiKeyCreatedAt: now,
          archivedAt: null,
          isActive: true,
          lastSync: now,
          errorCount: 0,
          lastError: null,
        },
      });
    } else {
      await this.prisma.integration.create({
        data: {
          merchantId,
          provider: this.restIntegrations.provider,
          type: 'API',
          config: configToSave,
          credentials,
          apiKeyHash: hash,
          apiKeyMask: mask,
          apiKeyCreatedAt: now,
          isActive: true,
          lastSync: now,
        },
      });
    }

    const state = await this.getState(merchantId);
    return {
      ...state,
      apiKey,
      message:
        'Новый API-ключ сгенерирован. Сохраните его сразу — он не будет показан повторно.',
    };
  }

  async disable(
    merchantId: string,
  ): Promise<RestApiIntegrationState & { message?: string }> {
    const existing = await this.restIntegrations.findByMerchant(merchantId);
    if (existing) {
      await this.prisma.integration.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          archivedAt: new Date(),
          apiKeyHash: null,
          apiKeyMask: null,
          apiKeyCreatedAt: null,
          credentials: Prisma.JsonNull,
        },
      });
    }
    const state = await this.getState(merchantId);
    return { ...state, message: 'Интеграция отключена' };
  }

  private extractMaskFromCredentials(
    value: Prisma.JsonValue | null | undefined,
  ): string | null {
    try {
      if (!value || typeof value !== 'object') return null;
      const raw = value as Record<string, any>;
      const mask =
        typeof raw.apiKeyMask === 'string'
          ? raw.apiKeyMask
          : typeof raw.tokenMask === 'string'
            ? raw.tokenMask
            : null;
      return mask ?? null;
    } catch {
      return null;
    }
  }

  private buildEndpoints(baseUrl: string | null | undefined): string[] {
    const normalizedBase = (baseUrl || '').replace(/\/$/, '');
    const prefix = normalizedBase
      ? `${normalizedBase}/api/integrations`
      : '/api/integrations';
    return [
      `${prefix}/code`,
      `${prefix}/bonus/calculate`,
      `${prefix}/bonus`,
      `${prefix}/refund`,
    ];
  }
}
