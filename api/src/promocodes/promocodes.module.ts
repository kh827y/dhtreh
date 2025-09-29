import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { PromoCodesService } from './promocodes.service';

@Module({
  imports: [PrismaModule, MetricsModule],
  providers: [PromoCodesService],
  exports: [PromoCodesService],
})
export class PromoCodesModule {}
