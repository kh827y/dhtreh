import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma.service';
import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';
import { HoldGcWorker } from './hold-gc.worker';
import { IdempotencyGcWorker } from './idempotency-gc.worker';
import { PointsTtlWorker } from './points-ttl.worker';
import { PointsBurnWorker } from './points-burn.worker';
import { PointsTtlReminderWorker } from './points-ttl-reminder.worker';

@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private outbox: OutboxDispatcherWorker,
    private holdGc: HoldGcWorker,
    private idemGc: IdempotencyGcWorker,
    private ttlPreview: PointsTtlWorker,
    private ttlBurn: PointsBurnWorker,
    private ttlReminder: PointsTtlReminderWorker,
  ) {}

  @Get('healthz')
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200);
      return {
        ok: true,
        version: process.env.APP_VERSION || 'dev',
        flags: {
          LEDGER_FEATURE: process.env.LEDGER_FEATURE === '1',
          EARN_LOTS_FEATURE: process.env.EARN_LOTS_FEATURE === '1',
          POINTS_TTL_FEATURE: process.env.POINTS_TTL_FEATURE === '1',
          POINTS_TTL_BURN: process.env.POINTS_TTL_BURN === '1',
        },
        workers: {
          outbox: {
            alive: !!this.outbox?.startedAt,
            lastTickAt: this.outbox?.lastTickAt?.toISOString?.(),
          },
          holdGc: { alive: true },
          idemGc: { alive: true },
          ttlPreview: {
            alive: !!this.ttlPreview?.startedAt,
            lastTickAt: this.ttlPreview?.lastTickAt?.toISOString?.(),
          },
          ttlBurn: {
            alive: !!this.ttlBurn?.startedAt,
            lastTickAt: this.ttlBurn?.lastTickAt?.toISOString?.(),
          },
          ttlReminder: {
            alive: !!this.ttlReminder?.startedAt,
            lastTickAt: this.ttlReminder?.lastTickAt?.toISOString?.(),
          },
        },
      };
    } catch (e: any) {
      res.status(503);
      return {
        ok: false,
        error: String(e?.message || e),
        version: process.env.APP_VERSION || 'dev',
      };
    }
  }

  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // можно добавить проверку иных зависимостей (очередей и т.д.)
      const outboxAlive = !!this.outbox?.startedAt;
      let migrations = null as null | { applied: number };
      try {
        const rows = await this.prisma.$queryRawUnsafe<any[]>(
          'SELECT COUNT(*)::int as c FROM _prisma_migrations WHERE applied_steps_count > 0',
        );
        migrations = { applied: Number(rows?.[0]?.c || 0) };
      } catch {}
      res.status(200);
      return {
        ready: true,
        version: process.env.APP_VERSION || 'dev',
        migrations,
        flags: {
          LEDGER_FEATURE: process.env.LEDGER_FEATURE === '1',
          EARN_LOTS_FEATURE: process.env.EARN_LOTS_FEATURE === '1',
          POINTS_TTL_FEATURE: process.env.POINTS_TTL_FEATURE === '1',
          POINTS_TTL_BURN: process.env.POINTS_TTL_BURN === '1',
        },
        workers: {
          outbox: {
            alive: outboxAlive,
            lastTickAt: this.outbox?.lastTickAt?.toISOString?.(),
          },
          holdGc: { alive: true },
          idemGc: { alive: true },
          ttlPreview: {
            alive: !!this.ttlPreview?.startedAt,
            lastTickAt: this.ttlPreview?.lastTickAt?.toISOString?.(),
          },
          ttlBurn: {
            alive: !!this.ttlBurn?.startedAt,
            lastTickAt: this.ttlBurn?.lastTickAt?.toISOString?.(),
          },
          ttlReminder: {
            alive: !!this.ttlReminder?.startedAt,
            lastTickAt: this.ttlReminder?.lastTickAt?.toISOString?.(),
          },
        },
      };
    } catch (e: any) {
      res.status(503);
      return {
        ready: false,
        error: String(e?.message || e),
        version: process.env.APP_VERSION || 'dev',
      };
    }
  }
}
