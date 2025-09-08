import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { HoldStatus } from '@prisma/client';
import { MetricsService } from './metrics.service';

@Injectable()
export class HoldGcWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldGcWorker.name);
  private timer: any = null;
  private running = false;

  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  onModuleInit() {
    const intervalMs = Number(process.env.HOLD_GC_INTERVAL_MS || '30000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    this.logger.log(`HoldGcWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return; this.running = true;
    try {
      const now = new Date();
      const expired = await this.prisma.hold.findMany({ where: { status: HoldStatus.PENDING, expiresAt: { lt: now } }, take: 50 });
      for (const h of expired) {
        try {
          await this.prisma.hold.update({ where: { id: h.id }, data: { status: HoldStatus.CANCELED } });
          this.metrics.inc('loyalty_hold_gc_canceled_total');
        } catch {}
      }
    } finally { this.running = false; }
  }
}
