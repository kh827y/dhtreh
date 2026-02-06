import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PrismaService } from '../../core/prisma/prisma.service';
import { safeExecAsync } from '../../shared/safe-exec';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AdminAuditInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const method: string = (req.method || 'GET').toUpperCase();
    const isWrite = !/^(GET|HEAD|OPTIONS)$/i.test(method);
    if (!isWrite) return next.handle();
    const actor: string = getActor(req);
    const path: string = req.originalUrl || req.url || '';
    const bodyRecord = toRecord(req.body);
    const merchantId: string | undefined =
      req.params?.merchantId ||
      req.params?.id ||
      (typeof bodyRecord?.merchantId === 'string'
        ? bodyRecord.merchantId
        : undefined);
    const action = `${method} ${path}`;
    // Пишем запись после выполнения обработчика (статус нас не волнует на данном этапе)
    return next.handle().pipe(
      tap(() => {
        void this.writeAudit({
          actor,
          method,
          path,
          merchantId,
          action,
          payload: sanitizePayload(req.body),
        });
      }),
      catchError((error: unknown) => {
        void this.writeAudit({
          actor,
          method,
          path,
          merchantId,
          action,
          payload: {
            request: sanitizePayload(req.body),
            error: {
              message: formatErrorMessage(error),
              name: getErrorName(error),
              status: getErrorStatus(error),
            },
          } as Prisma.InputJsonValue,
        });
        return throwError(() => error);
      }),
    );
  }

  private async writeAudit(entry: {
    actor: string;
    method: string;
    path: string;
    merchantId?: string;
    action: string;
    payload: Prisma.InputJsonValue | null;
  }) {
    await safeExecAsync(
      () =>
        this.prisma.adminAudit.create({
          data: {
            actor: entry.actor,
            method: entry.method,
            path: entry.path,
            merchantId: entry.merchantId ?? null,
            action: entry.action,
            payload: entry.payload === null ? Prisma.DbNull : entry.payload,
          },
        }),
      () => undefined,
      this.logger,
      'admin audit write failed',
    );
  }
}

function normalizeIp(ip?: string): string {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) return ip.replace('::ffff:', '');
  const idx = ip.indexOf(':');
  if (idx > -1 && ip.indexOf('.') === -1) return ip;
  if (ip.includes(':') && ip.includes('.')) {
    const part = ip.split(':').pop();
    return part || ip;
  }
  return ip;
}

type RequestLike = {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string | undefined>;
  body?: unknown;
  ip?: string;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
};

function getActor(req: RequestLike): string {
  const cand =
    req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
  const ip = normalizeIp(cand);
  return ip || 'UNKNOWN';
}

const REDACT_KEYS = [
  'password',
  'pass',
  'passwd',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'authorization',
  'webhooksecret',
  'initdata',
  'email',
  'phone',
  'firstname',
  'lastname',
  'birthdate',
  'birthday',
  'address',
  'telegram',
  'tgid',
];

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return REDACT_KEYS.some((entry) => normalized.includes(entry));
}

function redactValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): Prisma.JsonValue | null {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    return value as Prisma.JsonValue;
  }
  if (seen.has(value)) return null;
  if (depth > 6) return null;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }
  const result: Record<string, Prisma.JsonValue | null> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    result[key] = redactValue(entry, depth + 1, seen);
  }
  return result;
}

function sanitizePayload(body: unknown): Prisma.InputJsonValue | null {
  try {
    if (!body || typeof body !== 'object') return null;
    const clone = redactValue(body);
    const json = JSON.stringify(clone);
    return json.length > 10_000
      ? ({ truncated: true } as Prisma.InputJsonValue)
      : (clone as Prisma.InputJsonValue);
  } catch (err) {
    logIgnoredError(
      err,
      'AdminAuditInterceptor sanitize payload',
      undefined,
      'debug',
    );
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'unknown_error';
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error && error.name) return error.name;
  if (error && typeof error === 'object') {
    const value = (error as Record<string, unknown>).name;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>).status;
  return typeof value === 'number' ? value : undefined;
}
