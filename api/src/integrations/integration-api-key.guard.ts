import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RestApiIntegrationsService } from './rest-api-integrations.service';

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly restIntegrations: RestApiIntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
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
    req.integrationRequireBridgeSignature = config.requireBridgeSignature;
    req.integrationApiKeyHash = integration.apiKeyHash;
    if (!req.merchantId) {
      req.merchantId = integration.merchantId;
    }

    return true;
  }

  private extractKey(req: any): string {
    const viaGetter =
      typeof req.get === 'function' ? req.get('x-api-key') : undefined;
    const rawHeader =
      viaGetter ??
      req.headers?.['x-api-key'] ??
      req.headers?.['X-Api-Key'] ??
      req.headers?.['x_api_key'] ??
      req.headers?.['x-api_key'];
    const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const bearer = req.headers?.['authorization']?.replace('Bearer ', '');
    return String(headerKey || bearer || '').trim();
  }
}
