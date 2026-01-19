import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | string[] | undefined;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const apiKey = this.readApiKey(req);

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
  }

  private readApiKey(req: RequestLike): string {
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

  private getHeader(req: RequestLike, name: string): string | undefined {
    const value =
      typeof req.get === 'function' ? req.get(name) : req.headers?.[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0];
    return undefined;
  }
}
