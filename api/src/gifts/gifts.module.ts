import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { GiftsService } from './gifts.service';
import { GiftsController } from './gifts.controller';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { MetricsModule } from '../metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [GiftsService, LoyaltyService],
  controllers: [GiftsController],
})
export class GiftsModule {}
