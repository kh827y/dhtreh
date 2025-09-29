import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { GiftsService } from './gifts.service';
import { GiftsController } from './gifts.controller';
import { MetricsModule } from '../metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [GiftsService],
  controllers: [GiftsController],
  exports: [GiftsService],
})
export class GiftsModule {}
