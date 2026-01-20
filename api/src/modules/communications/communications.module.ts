import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MetricsModule } from '../../core/metrics/metrics.module';
import { TelegramModule } from '../telegram/telegram.module';

import { CommunicationsService } from './communications.service';
import { CommunicationsTemplatesService } from './communications-templates.service';
import { CommunicationsTasksService } from './communications-tasks.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsDispatcherWorker } from './communications-dispatcher.worker';
import { PortalGuard } from '../portal-auth/portal.guard';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, MetricsModule, TelegramModule, SubscriptionModule],
  providers: [
    CommunicationsService,
    CommunicationsTemplatesService,
    CommunicationsTasksService,
    CommunicationsDispatcherWorker,
    PortalGuard,
  ],
  controllers: [CommunicationsController],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
