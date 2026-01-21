import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { PromoCodesService } from '../../promocodes/promocodes.service';
import { TelegramStaffNotificationsService } from '../../telegram/staff-notifications.service';
import { StaffMotivationEngine } from '../../staff-motivation/staff-motivation.engine';
import { LoyaltyContextService } from './loyalty-context.service';
import { LoyaltyTierService } from './loyalty-tier.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { LoyaltyOpsBase } from './loyalty-ops-base.service';
import { LoyaltyQuoteService } from './loyalty-quote.service';
import { LoyaltyCommitService } from './loyalty-commit.service';
import { LoyaltyIntegrationService } from './loyalty-integration.service';
import { LoyaltyRefundService } from './loyalty-refund.service';

export class LoyaltyOperationsService extends LoyaltyOpsBase {
  private readonly quoteService: LoyaltyQuoteService;
  private readonly commitService: LoyaltyCommitService;
  private readonly integrationService: LoyaltyIntegrationService;
  private readonly refundService: LoyaltyRefundService;

  constructor(
    prisma: PrismaService,
    metrics: MetricsService,
    promoCodes: PromoCodesService,
    staffNotifications: TelegramStaffNotificationsService,
    staffMotivation: StaffMotivationEngine,
    context: LoyaltyContextService,
    tiers: LoyaltyTierService,
    config: AppConfigService,
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
    this.commitService = new LoyaltyCommitService(
      prisma,
      metrics,
      promoCodes,
      staffNotifications,
      staffMotivation,
      context,
      tiers,
      config,
    );
    this.quoteService = new LoyaltyQuoteService(
      prisma,
      metrics,
      promoCodes,
      staffNotifications,
      staffMotivation,
      context,
      tiers,
      config,
    );
    this.refundService = new LoyaltyRefundService(
      prisma,
      metrics,
      promoCodes,
      staffNotifications,
      staffMotivation,
      context,
      tiers,
      config,
    );
    this.integrationService = new LoyaltyIntegrationService(
      this.commitService,
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

  async quote(...args: Parameters<LoyaltyQuoteService['quote']>) {
    return this.quoteService.quote(...args);
  }

  async commit(...args: Parameters<LoyaltyCommitService['commit']>) {
    return this.commitService.commit(...args);
  }

  async processIntegrationBonus(
    ...args: Parameters<LoyaltyIntegrationService['processIntegrationBonus']>
  ) {
    return this.integrationService.processIntegrationBonus(...args);
  }

  async calculateBonusPreview(
    ...args: Parameters<LoyaltyIntegrationService['calculateBonusPreview']>
  ) {
    return this.integrationService.calculateBonusPreview(...args);
  }

  async refund(...args: Parameters<LoyaltyRefundService['refund']>) {
    return this.refundService.refund(...args);
  }

  async cancel(...args: Parameters<LoyaltyRefundService['cancel']>) {
    return this.refundService.cancel(...args);
  }
}
