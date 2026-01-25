import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CustomerAudiencesService } from './customer-audiences.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../../shared/pg-lock.util';
import { AppConfigService } from '../../core/config/app-config.service';

@Injectable()
export class CustomerAudiencesWorker implements OnModuleInit {
  private readonly logger = new Logger(CustomerAudiencesWorker.name);
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;

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
    this.lastTickAt = new Date();
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'cron:customer_audiences_nightly',
    );
    if (!lock.ok) return;
    try {
      const merchants = await this.prisma.merchant.findMany({
        select: { id: true },
      });
      for (const merchant of merchants) {
        const segments = await this.prisma.customerSegment.findMany({
          where: { merchantId: merchant.id },
        });
        for (const segment of segments) {
          try {
            await this.audiences.recalculateSegmentMembership(
              merchant.id,
              segment,
            );
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
    }
  }
}
