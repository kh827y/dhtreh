import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RestApiIntegrationsService } from './rest-api-integrations.service';

type IntegrationRequest = {
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | string[] | undefined;
  merchantId?: string;
  integrationId?: string;
  integrationMerchantId?: string;
  integrationProvider?: string;
  integrationConfig?: unknown;
  integrationRateLimits?: unknown;
  integrationApiKeyHash?: string;
};

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly restIntegrations: RestApiIntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<IntegrationRequest>();
    const apiKey = this.extractKey(req);
    if (!apiKey) {
      throw new UnauthorizedException(
        'API-ключ обязателен в заголовке X-Api-Key',
      );
    }

    const integration = await this.restIntegrations.findByApiKey(apiKey);
    if (!integration) {
      throw new UnauthorizedException('Неверный API-ключ');
    }
    if (!integration.isActive || integration.archivedAt) {
      throw new ForbiddenException('Интеграция отключена или архивирована');
    }

    const config = this.restIntegrations.normalizeConfig(integration.config);
    req.integrationId = integration.id;
    req.integrationMerchantId = integration.merchantId;
    req.integrationProvider = integration.provider;
    req.integrationConfig = config;
    req.integrationRateLimits = config.rateLimits;
    req.integrationApiKeyHash = integration.apiKeyHash ?? undefined;
    if (!req.merchantId) {
      req.merchantId = integration.merchantId;
    }

    return true;
  }

  private extractKey(req: IntegrationRequest): string {
    const headerKey =
      this.getHeader(req, 'x-api-key') ||
      this.getHeader(req, 'X-Api-Key') ||
      this.getHeader(req, 'x_api_key') ||
      this.getHeader(req, 'x-api_key');
    const bearer = this.getHeader(req, 'authorization');
    const bearerToken =
      typeof bearer === 'string' ? bearer.replace('Bearer ', '') : '';
    return String(headerKey || bearerToken || '').trim();
  }

  private getHeader(req: IntegrationRequest, name: string): string | undefined {
    const value =
      typeof req.get === 'function' ? req.get(name) : req.headers?.[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0];
    return undefined;
  }
}
