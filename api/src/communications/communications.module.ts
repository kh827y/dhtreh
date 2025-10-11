import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MetricsModule } from '../metrics.module';
import { TelegramModule } from '../telegram/telegram.module';

import { CommunicationsService } from './communications.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsDispatcherWorker } from './communications-dispatcher.worker';

@Module({
  imports: [PrismaModule, MetricsModule, TelegramModule],
  providers: [CommunicationsService, CommunicationsDispatcherWorker],
  controllers: [CommunicationsController],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
