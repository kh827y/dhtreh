import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import type { OperationsLogFilters } from '../loyalty-program.types';
import { logEvent, safeMetric } from '../../../shared/logging/event-log.util';

type PromoCodeUsageRecord = Prisma.PromoCodeUsageGetPayload<object>;
type PromotionParticipantRecord = Prisma.PromotionParticipantGetPayload<object>;

type OperationsLogResult = {
  promoCodes?: PromoCodeUsageRecord[];
  promoCodesTotal?: number;
  promotions?: PromotionParticipantRecord[];
  promotionsTotal?: number;
  limit?: number;
  offset?: number;
};

@Injectable()
export class LoyaltyProgramOperationsService {
  private readonly logger = new Logger(LoyaltyProgramOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async operationsLog(merchantId: string, filters: OperationsLogFilters = {}) {
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    const limitRaw = Number(filters.limit ?? 200);
    const offsetRaw = Number(filters.offset ?? 0);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
      : 200;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(Math.floor(offsetRaw), 0)
      : 0;

    const logs: OperationsLogResult = {};
    if (!filters.type || filters.type === 'PROMO_CODE') {
      logs.promoCodes = await this.prisma.promoCodeUsage.findMany({
        where: {
          merchantId,
          usedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { usedAt: 'desc' },
        take: limit,
        skip: offset,
      });
      logs.promoCodesTotal = await this.prisma.promoCodeUsage.count({
        where: {
          merchantId,
          usedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
      });
    }
    if (!filters.type || filters.type === 'PROMOTION') {
      logs.promotions = await this.prisma.promotionParticipant.findMany({
        where: {
          merchantId,
          joinedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
        orderBy: { joinedAt: 'desc' },
        take: limit,
        skip: offset,
      });
      logs.promotionsTotal = await this.prisma.promotionParticipant.count({
        where: {
          merchantId,
          joinedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        },
      });
    }

    logEvent(this.logger, 'portal.loyalty.operations.log', {
      merchantId,
      type: filters.type ?? 'ALL',
      promoCodes: logs.promoCodes?.length ?? 0,
      promotions: logs.promotions?.length ?? 0,
    });
    safeMetric(this.metrics, 'portal_loyalty_operations_list_total');
    logs.limit = limit;
    logs.offset = offset;
    return logs;
  }
}
