import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from './prisma.service';

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method || 'GET').toUpperCase();
    const isWrite = !/^(GET|HEAD|OPTIONS)$/i.test(method);
    if (!isWrite) return next.handle();
    const actor: string =
      (req.headers?.['x-admin-actor'] as string | undefined) || 'UNKNOWN';
    const path: string = req.originalUrl || req.url || '';
    const merchantId: string | undefined =
      req.params?.id || req.body?.merchantId || undefined;
    const action = `${method} ${path}`;
    // Пишем запись после выполнения обработчика (статус нас не волнует на данном этапе)
    return next.handle().pipe(
      tap(async () => {
        try {
          const payload = sanitizePayload(req.body);
          await this.prisma.adminAudit.create({
            data: {
              actor,
              method,
              path,
              merchantId: merchantId ?? null,
              action,
              payload,
            },
          });
        } catch {}
      }),
    );
  }
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
  'bridgesecret',
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
