import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method || 'GET').toUpperCase();
    const isWrite = !/^(GET|HEAD|OPTIONS)$/i.test(method);
    if (!isWrite) return next.handle();
    const actor: string = getActor(req);
    const path: string = req.originalUrl || req.url || '';
    const merchantId: string | undefined =
      req.params?.merchantId ||
      req.params?.id ||
      req.body?.merchantId ||
      undefined;
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
      catchError((error: any) => {
        void this.writeAudit({
          actor,
          method,
          path,
          merchantId,
          action,
          payload: {
            request: sanitizePayload(req.body),
            error: {
              message: String(error?.message || error || 'unknown_error'),
              name: error?.name,
              status: error?.status,
            },
          },
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
    payload: any;
  }) {
    try {
      await this.prisma.adminAudit.create({
        data: {
          actor: entry.actor,
          method: entry.method,
          path: entry.path,
          merchantId: entry.merchantId ?? null,
          action: entry.action,
          payload: entry.payload,
        },
      });
    } catch {}
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

function getActor(req: any): string {
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
];

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return REDACT_KEYS.some((entry) => normalized.includes(entry));
}

function redactValue(value: any, depth = 0, seen = new WeakSet()): any {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  if (depth > 6) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen));
  }
  const result: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    result[key] = redactValue(entry, depth + 1, seen);
  }
  return result;
}

function sanitizePayload(body: any) {
  try {
    if (!body || typeof body !== 'object') return null;
    const clone = redactValue(body);
    const json = JSON.stringify(clone);
    return json.length > 10_000 ? { truncated: true } : clone;
  } catch {
    return null;
  }
}
