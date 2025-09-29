import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { PrismaModule } from '../prisma.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { VouchersModule } from '../vouchers/vouchers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CampaignModule } from '../campaigns/campaign.module';
import { GiftsModule } from '../gifts/gifts.module';
import { PortalCatalogService } from './catalog.service';
import { PortalCustomersService } from './customers.service';
import { PushCampaignsService } from './services/push-campaigns.service';
import { TelegramCampaignsService } from './services/telegram-campaigns.service';
import { StaffMotivationService } from './services/staff-motivation.service';
import { ActionsService } from './services/actions.service';
import { OperationsLogService } from './services/operations-log.service';

@Module({
  imports: [PrismaModule, MerchantsModule, VouchersModule, NotificationsModule, AnalyticsModule, CampaignModule, GiftsModule],
  controllers: [PortalController],
  providers: [PortalGuard, PortalCatalogService, PushCampaignsService, TelegramCampaignsService, StaffMotivationService, ActionsService, OperationsLogService, PortalCustomersService],
})
export class PortalModule {}
