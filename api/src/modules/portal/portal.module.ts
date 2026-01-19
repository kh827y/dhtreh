import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PortalCatalogService } from './catalog.service';
import { PortalCustomersService } from './customers.service';
import { StaffMotivationService } from './services/staff-motivation.service';
import { OperationsLogService } from './services/operations-log.service';
import { TelegramModule } from '../telegram/telegram.module';
import { PortalTelegramIntegrationService } from './services/telegram-integration.service';
import { PortalTelegramNotifyService } from './services/telegram-notify.service';
import { CommunicationsModule } from '../communications/communications.module';
import { ReferralModule } from '../referral/referral.module';
import { PortalReviewsService } from './services/reviews.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CustomerAudiencesModule } from '../customer-audiences/customer-audiences.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PortalRestApiIntegrationService } from './services/rest-api-integration.service';
import { ImportExportModule } from '../import-export/import-export.module';

@Module({
  imports: [
    PrismaModule,
    MerchantsModule,
    PromoCodesModule,
    NotificationsModule,
    AnalyticsModule,
    CustomerAudiencesModule,
    TelegramModule,
    CommunicationsModule,
    ReferralModule,
    LoyaltyModule,
    SubscriptionModule,
    IntegrationsModule,
    ImportExportModule,
  ],
  controllers: [PortalController],
  providers: [
    PortalGuard,
    PortalCatalogService,
    StaffMotivationService,
    OperationsLogService,
    PortalCustomersService,
    PortalTelegramIntegrationService,
    PortalTelegramNotifyService,
    PortalReviewsService,
    PortalRestApiIntegrationService,
  ],
})
export class PortalModule {}
