import { Module } from '@nestjs/common';
import { PortalAccountController } from './controllers/portal-account.controller';
import { PortalAnalyticsController } from './controllers/portal-analytics.controller';
import { PortalCatalogController } from './controllers/portal-catalog.controller';
import { PortalCommunicationsController } from './controllers/portal-communications.controller';
import { PortalCustomersController } from './controllers/portal-customers.controller';
import { PortalIntegrationsController } from './controllers/portal-integrations.controller';
import { PortalOperationsController } from './controllers/portal-operations.controller';
import { PortalPromocodesController } from './controllers/portal-promocodes.controller';
import { PortalSettingsController } from './controllers/portal-settings.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { PromoCodesModule } from '../promocodes/promocodes.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PortalCatalogService } from './services/catalog.service';
import { PortalCustomersService } from './services/customers.service';
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
import { PortalControllerHelpers } from './controllers/portal.controller-helpers';
import { PortalAccountUseCase } from './use-cases/portal-account.use-case';
import { PortalAnalyticsUseCase } from './use-cases/portal-analytics.use-case';
import { PortalCatalogUseCase } from './use-cases/portal-catalog.use-case';
import { PortalCommunicationsUseCase } from './use-cases/portal-communications.use-case';
import { PortalCustomersUseCase } from './use-cases/portal-customers.use-case';
import { PortalIntegrationsUseCase } from './use-cases/portal-integrations.use-case';
import { PortalOperationsUseCase } from './use-cases/portal-operations.use-case';
import { PortalPromocodesUseCase } from './use-cases/portal-promocodes.use-case';
import { PortalSettingsUseCase } from './use-cases/portal-settings.use-case';

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
  controllers: [
    PortalAccountController,
    PortalAnalyticsController,
    PortalCatalogController,
    PortalCommunicationsController,
    PortalCustomersController,
    PortalIntegrationsController,
    PortalOperationsController,
    PortalPromocodesController,
    PortalSettingsController,
  ],
  providers: [
    PortalGuard,
    PortalControllerHelpers,
    PortalAccountUseCase,
    PortalAnalyticsUseCase,
    PortalCatalogUseCase,
    PortalCommunicationsUseCase,
    PortalCustomersUseCase,
    PortalIntegrationsUseCase,
    PortalOperationsUseCase,
    PortalPromocodesUseCase,
    PortalSettingsUseCase,
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
