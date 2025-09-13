import { Module } from '@nestjs/common';
import { AntiFraudService } from './antifraud.service';
import { AntifraudController } from './antifraud.controller';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  controllers: [AntifraudController],
  providers: [AntiFraudService],
  exports: [AntiFraudService],
})
export class AntifraudModule {}
