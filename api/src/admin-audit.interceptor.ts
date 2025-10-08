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

function sanitizePayload(body: any) {
  try {
    if (!body || typeof body !== 'object') return null;
    const clone: any = { ...body };
    // вырежем секреты и длинные поля
    delete clone.webhookSecret;
    delete clone.webhookSecretNext;
    delete clone.bridgeSecret;
    delete clone.bridgeSecretNext;
    const json = JSON.stringify(clone);
    return json.length > 10_000 ? { truncated: true } : clone;
  } catch {
    return null;
  }
}
