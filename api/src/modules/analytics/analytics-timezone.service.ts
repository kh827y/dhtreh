import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  DEFAULT_TIMEZONE_CODE,
  RussiaTimezone,
  findTimezone,
} from '../../shared/timezone/russia-timezones';

@Injectable()
export class AnalyticsTimezoneService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimezoneInfo(
    merchantId: string,
    timezone?: string | RussiaTimezone | null,
  ): Promise<RussiaTimezone> {
    if (!timezone) {
      const row = await this.prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { timezone: true },
      });
      return findTimezone(row?.timezone ?? DEFAULT_TIMEZONE_CODE);
    }
    if (typeof timezone === 'string') return findTimezone(timezone);
    return timezone;
  }

  async resolveTimezone(
    merchantId: string,
    timezone?: string | RussiaTimezone,
  ) {
    return this.getTimezoneInfo(merchantId, timezone);
  }
}
