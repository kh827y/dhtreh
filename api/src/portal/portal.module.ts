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
import { PortalCustomersController } from './customers.controller';
import { PortalCustomersService } from './customers.service';
import { PortalAntifraudController } from './antifraud.controller';
import { AntifraudModule } from '../antifraud/antifraud.module';

@Module({
  imports: [
    PrismaModule,
    MerchantsModule,
    VouchersModule,
    NotificationsModule,
    AnalyticsModule,
    CampaignModule,
    GiftsModule,
    AntifraudModule,
  ],
  controllers: [PortalController, PortalCustomersController, PortalAntifraudController],
  providers: [PortalGuard, PortalCustomersService],
})
export class PortalModule {}
