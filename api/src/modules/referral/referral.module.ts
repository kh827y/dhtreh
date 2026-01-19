import { Module } from '@nestjs/common';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramMiniappGuard } from '../../core/guards/telegram-miniapp.guard';

@Module({
  imports: [PrismaModule, ConfigModule, LoyaltyModule, NotificationsModule],
  controllers: [ReferralController],
  providers: [ReferralService, TelegramMiniappGuard],
  exports: [ReferralService],
})
export class ReferralModule {}
