import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AdminMerchantsController } from './admin-merchants.controller';
import { AdminMerchantsService } from './admin-merchants.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AdminAuditInterceptor } from '../admin-audit.interceptor';

@Module({
  imports: [PrismaModule, MerchantsModule, TelegramModule, SubscriptionModule],
  controllers: [AdminMerchantsController, AdminNotificationsController],
  providers: [AdminMerchantsService, AdminAuditInterceptor],
  exports: [AdminMerchantsService],
})
export class AdminPanelModule {}
