import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CustomerAudiencesService } from './customer-audiences.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../../shared/pg-lock.util';
import { AppConfigService } from '../../core/config/app-config.service';

@Injectable()
export class CustomerAudiencesWorker implements OnModuleInit {
  private readonly logger = new Logger(CustomerAudiencesWorker.name);
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  public lastProgressAt: Date | null = null;
  public lastLockMissAt: Date | null = null;
  public lockMissCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: CustomerAudiencesService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    this.startedAt = new Date();
  }

  @Cron('0 3 * * *')
  async nightlyRecalculate() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) return;
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();
    this.lastProgressAt = this.lastTickAt;
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'cron:customer_audiences_nightly',
    );
    if (!lock.ok) {
      this.lockMissCount += 1;
      this.lastLockMissAt = new Date();
      this.running = false;
      return;
    }
    try {
      const merchants = await this.prisma.merchant.findMany({
        select: { id: true },
      });
      for (const merchant of merchants) {
        this.lastProgressAt = new Date();
        const segments = await this.prisma.customerSegment.findMany({
          where: { merchantId: merchant.id },
        });
        for (const segment of segments) {
          try {
            await this.audiences.recalculateSegmentMembership(
              merchant.id,
              segment,
            );
            this.lastProgressAt = new Date();
          } catch (err) {
            this.logger.warn(
              `Failed to recalculate audience ${segment.id} for merchant ${merchant.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `CustomerAudiencesWorker nightlyRecalculate failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }
}
