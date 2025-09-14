import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma.module';
import { TelegramBotService } from './telegram-bot.service';
import { AdminIpGuard } from '../admin-ip.guard';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [TelegramController],
  providers: [TelegramBotService, AdminIpGuard],
  exports: [TelegramBotService],
})
export class TelegramModule {}

