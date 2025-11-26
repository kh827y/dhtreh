import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionCronService } from './subscription.cron';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { MetricsModule } from '../metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    MetricsModule,
    NotificationsModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionCronService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
