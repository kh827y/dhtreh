import { Module } from '@nestjs/common';
import { AntiFraudService } from './antifraud.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  controllers: [],
  providers: [AntiFraudService],
  exports: [AntiFraudService],
})
export class AntifraudModule {}
