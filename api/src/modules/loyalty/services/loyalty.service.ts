import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { PromoCodesService } from '../../promocodes/promocodes.service';
import { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import { LoyaltyContextService } from './loyalty-context.service';
import { LoyaltyTierService } from './loyalty-tier.service';
import { LoyaltyOperationsService } from './loyalty-operations.service';
import { AppConfigService } from '../../../core/config/app-config.service';

@Injectable()
export class LoyaltyService extends LoyaltyOperationsService {
  constructor(
    prisma: PrismaService,
    metrics: MetricsService,
    promoCodes: PromoCodesService,
    staffNotifications: TelegramStaffNotificationsService,
    staffMotivation: StaffMotivationEngine,
    context: LoyaltyContextService,
    tiers: LoyaltyTierService,
    config: AppConfigService = new AppConfigService(),
  ) {
    super(
      prisma,
      metrics,
      promoCodes,
      staffNotifications,
      staffMotivation,
      context,
      tiers,
      config,
    );
  }
}
