import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertMonitor } from '../../modules/alerts/ops-alert-monitor.service';
import { AppConfigService } from '../config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private readonly monitor: OpsAlertMonitor,
    private readonly config: AppConfigService,
  ) {}

  private async checkDatabase() {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      logIgnoredError(err, 'HealthController db ping', undefined, 'debug');
    }
    let migrationsOk = true;
    if (dbOk) {
      try {
        await this.prisma.$queryRawUnsafe<any[]>(
          'SELECT COUNT(*)::int as c FROM _prisma_migrations WHERE applied_steps_count > 0',
        );
      } catch (err) {
        logIgnoredError(
          err,
          'HealthController migrations check',
          undefined,
          'debug',
        );
        migrationsOk = false;
      }
    }
    return { dbOk, migrationsOk };
  }

  @Get('healthz')
  async health(@Res({ passthrough: true }) res: Response) {
    const now = new Date().toISOString();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200);
      return {
        ok: true,
        ts: now,
      };
    } catch (err) {
      logIgnoredError(err, 'HealthController healthz', undefined, 'debug');
      res.status(503);
      return {
        ok: false,
        ts: now,
      };
    }
  }

  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    const now = new Date().toISOString();
    const { dbOk, migrationsOk } = await this.checkDatabase();
    const ready = dbOk && migrationsOk;
    res.status(ready ? 200 : 503);
    return {
      ready,
      ts: now,
      checks: {
        database: dbOk,
        migrations: migrationsOk,
      },
    };
  }

  @Get('readyz/ops')
  async opsReady(@Res({ passthrough: true }) res: Response) {
    const now = new Date().toISOString();
    const { dbOk, migrationsOk } = await this.checkDatabase();
    const pendingThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_OUTBOX_PENDING_THRESHOLD', 100) ?? 100,
    );
    const deadThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_OUTBOX_DEAD_THRESHOLD', 5) ?? 5,
    );

    let workersOk = true;
    let workersExpected = 0;
    let workersStale = 0;
    let outboxOk = true;
    let outboxPending = 0;
    let outboxDead = 0;
    let workers: Awaited<ReturnType<OpsAlertMonitor['snapshot']>>['workers'] =
      [];
    try {
      const snapshot = await this.monitor.snapshot();
      workers = snapshot.workers;
      const expected = workers.filter((w) => w.expected);
      workersExpected = expected.length;
      workersStale = expected.filter((w) => w.stale).length;
      workersOk = workersStale === 0;
      outboxPending = snapshot.metrics.outboxPending;
      outboxDead = snapshot.metrics.outboxDead;
      outboxOk =
        (pendingThreshold <= 0 || outboxPending <= pendingThreshold) &&
        (deadThreshold <= 0 || outboxDead <= deadThreshold);
    } catch {
      workersOk = false;
      outboxOk = false;
    }

    const ready = dbOk && migrationsOk && workersOk && outboxOk;
    res.status(ready ? 200 : 503);
    return {
      ready,
      ts: now,
      checks: {
        database: dbOk,
        migrations: migrationsOk,
        workers: {
          ok: workersOk,
          expected: workersExpected,
          stale: workersStale,
        },
        outbox: {
          ok: outboxOk,
          pending: outboxPending,
          dead: outboxDead,
          pendingThreshold,
          deadThreshold,
        },
      },
      workers,
    };
  }
}
