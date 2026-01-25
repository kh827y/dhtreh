import { Module } from '@nestjs/common';
import { PortalAuthController } from './portal-auth.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';

@Module({
  imports: [PrismaModule, MetricsModule],
  controllers: [PortalAuthController],
})
export class PortalAuthModule {}
