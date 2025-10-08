import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma.module';
import { TelegramBotService } from './telegram-bot.service';
import { AdminIpGuard } from '../admin-ip.guard';
import { TelegramController } from './telegram.controller';
import { TelegramNotifyService } from './telegram-notify.service';
import { TelegramNotifyController } from './telegram-notify.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [TelegramController, TelegramNotifyController],
  providers: [TelegramBotService, TelegramNotifyService, AdminIpGuard],
  exports: [TelegramBotService, TelegramNotifyService],
})
export class TelegramModule {}
