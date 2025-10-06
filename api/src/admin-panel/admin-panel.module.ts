import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AdminMerchantsController } from './admin-merchants.controller';
import { AdminMerchantsService } from './admin-merchants.service';
import { MerchantsModule } from '../merchants/merchants.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, MerchantsModule, TelegramModule],
  controllers: [AdminMerchantsController, AdminNotificationsController],
  providers: [AdminMerchantsService],
  exports: [AdminMerchantsService],
})
export class AdminPanelModule {}
