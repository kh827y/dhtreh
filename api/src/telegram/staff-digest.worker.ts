import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { TelegramStaffNotificationsService } from './staff-notifications.service';

@Injectable()
export class TelegramStaffDigestWorker {
  private readonly logger = new Logger(TelegramStaffDigestWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffNotify: TelegramStaffNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailyDigest() {
    if (process.env.WORKERS_ENABLED === '0') return;
    try {
      const target = new Date();
      target.setDate(target.getDate() - 1);
      target.setHours(0, 0, 0, 0);
      const isoDate = target.toISOString().slice(0, 10);
      const merchants = await this.prisma.telegramStaffSubscriber.findMany({
        where: { isActive: true },
        select: { merchantId: true },
        distinct: ['merchantId'],
      });
      for (const row of merchants) {
        const merchantId = row.merchantId;
        if (!merchantId) continue;
        try {
          await this.staffNotify.enqueueEvent(merchantId, {
            kind: 'DIGEST',
            date: isoDate,
          });
        } catch (error) {
          this.logger.debug(
            `Failed to enqueue daily digest for merchant=${merchantId}: ${error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`handleDailyDigest failed: ${error}`);
    }
  }
}
