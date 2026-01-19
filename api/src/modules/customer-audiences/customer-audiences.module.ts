import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';

import { MetricsModule } from '../../core/metrics/metrics.module';

import { CustomerAudiencesService } from './customer-audiences.service';
import { CustomerAudiencesController } from './customer-audiences.controller';
import { PortalGuard } from '../portal-auth/portal.guard';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, MetricsModule, SubscriptionModule],
  providers: [CustomerAudiencesService, PortalGuard],
  controllers: [CustomerAudiencesController],
  exports: [CustomerAudiencesService],
})
export class CustomerAudiencesModule {}
