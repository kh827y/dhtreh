import { Module } from '@nestjs/common';
import { AntiFraudService } from './antifraud.service';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  controllers: [],
  providers: [AntiFraudService],
  exports: [AntiFraudService],
})
export class AntifraudModule {}
