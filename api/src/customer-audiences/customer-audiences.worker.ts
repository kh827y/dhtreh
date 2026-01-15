import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { CustomerAudiencesService } from './customer-audiences.service';
import { pgAdvisoryUnlock, pgTryAdvisoryLock } from '../pg-lock.util';

@Injectable()
export class CustomerAudiencesWorker {
  private readonly logger = new Logger(CustomerAudiencesWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: CustomerAudiencesService,
  ) {}

  @Cron('0 3 * * *')
  async nightlyRecalculate() {
    if (process.env.WORKERS_ENABLED !== '1') return;
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
