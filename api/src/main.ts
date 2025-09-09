import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS из ENV (запятая-разделённый список); если не задан — дефолты для локалки
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'http://localhost:3001','http://127.0.0.1:3001',
    'http://localhost:3002','http://127.0.0.1:3002',
    'http://localhost:3003','http://127.0.0.1:3003',
  ];
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : defaultOrigins,
    methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
    allowedHeaders: ['Content-Type','x-admin-key','x-request-id','x-staff-key','x-bridge-signature','idempotency-key'],
    exposedHeaders: ['X-Loyalty-Signature','X-Merchant-Id','X-Signature-Timestamp','X-Request-Id','X-Event-Id','X-Signature-Key-Id'],
  });

  // Безопасность и производительность
  app.use(helmet());
  app.use(compression());

  // JSON-логирование запросов
  app.use(pinoHttp({
    autoLogging: true,
    customProps: (req) => {
      const mId = (req as any).body?.merchantId || req.headers['x-merchant-id'] || undefined;
      const reqId = (req as any).requestId || req.headers['x-request-id'] || undefined;
      return { requestId: reqId, merchantId: mId } as any;
    },
  }));

  // Валидация
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger (draft)
  const cfg = new DocumentBuilder()
    .setTitle('Loyalty API')
    .setDescription('Draft OpenAPI for loyalty endpoints')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, cfg);
  SwaggerModule.setup('docs', app, document);

  // Совместимый алиас: пробрасываем /api/v1/* на существующие маршруты, чтобы не ломать клиентов
  const http = app.getHttpAdapter().getInstance();
  http.use('/api/v1', (req, _res, next) => {
    try {
      const orig = (req as any).originalUrl || req.url || '';
      (req as any).url = String(orig).replace(/^\/api\/v1/, '') || '/';
    } catch {}
    next();
  });

  await app.listen(3000);
  console.log(`API on http://localhost:3000`);
}
bootstrap();
