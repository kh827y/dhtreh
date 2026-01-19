import { Module, forwardRef } from '@nestjs/common';
import { ReviewService } from './review.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    TelegramModule,
    forwardRef(() => LoyaltyModule),
  ],
  // controllers removed: public reviews API is deprecated
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
