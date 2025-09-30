import { Module } from '@nestjs/common';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { FcmProvider } from './push/providers/fcm.provider';
import { EmailController } from './email/email.controller';
import { EmailService } from './email/email.service';
import { PrismaModule } from '../prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [PushController, EmailController, NotificationsController],
  providers: [PushService, FcmProvider, EmailService, NotificationsService],
  exports: [PushService, EmailService, NotificationsService],
})
export class NotificationsModule {}
