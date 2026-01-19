import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { TelegramBotService } from './telegram-bot.service';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { TelegramController } from './telegram.controller';
import { TelegramNotifyService } from './telegram-notify.service';
import { TelegramNotifyController } from './telegram-notify.controller';
import { TelegramStaffNotificationsService } from './staff-notifications.service';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [TelegramController, TelegramNotifyController],
  providers: [
    TelegramBotService,
    TelegramNotifyService,
    TelegramStaffNotificationsService,
    AdminIpGuard,
    AdminAuditInterceptor,
  ],
  exports: [
    TelegramBotService,
    TelegramNotifyService,
    TelegramStaffNotificationsService,
  ],
})
export class TelegramModule {}
