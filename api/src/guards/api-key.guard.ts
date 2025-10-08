import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const viaGetter =
      typeof req.get === 'function' ? req.get('x-api-key') : undefined;
    const rawHeader =
      viaGetter ??
      req.headers['x-api-key'] ??
      req.headers['X-Api-Key'] ??
      req.headers['x_api_key'] ??
      req.headers['x-api_key'];
    const headerKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const bearer = req.headers['authorization']?.replace('Bearer ', '');
    const apiKey = (headerKey || bearer || '').toString().trim();

    const rawConfigured = this.configService.get<string>('API_KEY');
    const configuredKey =
      rawConfigured && rawConfigured.trim().length > 0
        ? rawConfigured.trim()
        : undefined;

    // Production: требуем корректно настроенный ключ и строгое совпадение
    if (process.env.NODE_ENV === 'production') {
      if (
        !configuredKey ||
        configuredKey === 'dev-api-key' ||
        configuredKey.length < 32
      ) {
        throw new UnauthorizedException(
          'API key not properly configured for production',
        );
      }
      if (apiKey === configuredKey) return true;
      throw new UnauthorizedException('Invalid API key');
    }

    // Non-production: принимаем либо настроенный ключ, либо 'test-key'
    const allowedKeys = new Set<string>();
    if (configuredKey) allowedKeys.add(configuredKey);
    allowedKeys.add('test-key');
    if (allowedKeys.has(apiKey)) return true;

    // Если дошли сюда — ключ не принят
    const expectedDisplay = configuredKey
      ? `${configuredKey} or test-key`
      : 'test-key';
    throw new UnauthorizedException(
      `Invalid API key; expected ${expectedDisplay}`,
    );

    throw new UnauthorizedException('Invalid API key');
  }
}
