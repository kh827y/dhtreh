import { Module, forwardRef } from '@nestjs/common';
import { ReviewService } from './review.service';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => LoyaltyModule)],
  // controllers removed: public reviews API is deprecated
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
