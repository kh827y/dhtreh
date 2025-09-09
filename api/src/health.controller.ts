import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { OutboxDispatcherWorker } from './outbox-dispatcher.worker';

@Controller()
export class HealthController {
  constructor(private prisma: PrismaService, private outbox: OutboxDispatcherWorker) {}

  @Get('healthz')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, version: process.env.APP_VERSION || 'dev', workers: { outbox: { alive: !!this.outbox?.startedAt, lastTickAt: this.outbox?.lastTickAt?.toISOString?.() } } };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e), version: process.env.APP_VERSION || 'dev' };
    }
  }

  @Get('readyz')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // можно добавить проверку иных зависимостей (очередей и т.д.)
      const outboxAlive = !!this.outbox?.startedAt;
      let migrations = null as null | { applied: number };
      try {
        const rows = await this.prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*)::int as c FROM _prisma_migrations WHERE applied_steps_count > 0");
        migrations = { applied: Number(rows?.[0]?.c || 0) };
      } catch {}
      return { ready: true, version: process.env.APP_VERSION || 'dev', migrations, workers: { outbox: { alive: outboxAlive, lastTickAt: this.outbox?.lastTickAt?.toISOString?.() } } };
    } catch (e: any) {
      return { ready: false, error: String(e?.message || e), version: process.env.APP_VERSION || 'dev' };
    }
  }
}
