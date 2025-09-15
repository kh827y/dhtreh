import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from './pg-lock.util';

@Injectable()
export class IdempotencyGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyGcWorker.name);
  private timer: any = null;
  private running = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') { this.logger.log('Workers disabled (WORKERS_ENABLED=0)'); return; }
    const intervalMs = Number(process.env.IDEMPOTENCY_GC_INTERVAL_MS || '60000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    try { if (this.timer && typeof this.timer.unref === 'function') this.timer.unref(); } catch {}
    this.logger.log(`IdempotencyGcWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return; this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, 'worker:idempotency_gc');
    if (!lock.ok) { this.running = false; return; }
    try {
      const now = new Date();
      const ttlH = Number(process.env.IDEMPOTENCY_TTL_HOURS || '72');
      const olderThan = new Date(Date.now() - ttlH * 3600 * 1000);
      await this.prisma.idempotencyKey.deleteMany({ where: { OR: [ { expiresAt: { lt: now } }, { expiresAt: null, createdAt: { lt: olderThan } } ] } });
    } finally { this.running = false; await pgAdvisoryUnlock(this.prisma, lock.key); }
  }
}
