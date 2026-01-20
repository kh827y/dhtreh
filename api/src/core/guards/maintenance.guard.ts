import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_PREFIXES = [
  '/healthz',
  '/readyz',
  '/live',
  '/health',
  '/ready',
  '/metrics',
];

const isEnabled = (raw?: string | null): boolean => {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
};

const isAllowedPath = (path: string): boolean =>
  ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));

@Injectable()
export class MaintenanceGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req?.path ?? req?.url ?? '';
    const method = String(req?.method ?? 'GET').toUpperCase();

    if (isAllowedPath(path)) return true;

    if (isEnabled(process.env.MAINTENANCE_MODE)) {
      throw new ServiceUnavailableException('Maintenance mode');
    }

    if (isEnabled(process.env.READ_ONLY_MODE) && !SAFE_METHODS.has(method)) {
      throw new ForbiddenException('Read-only mode');
    }

    return true;
  }
}
