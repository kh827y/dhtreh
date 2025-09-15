import { Module } from '@nestjs/common';
import { SmsController } from './sms/sms.controller';
import { SmsService } from './sms/sms.service';
import { SmscProvider } from './sms/providers/smsc.provider';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { FcmProvider } from './push/providers/fcm.provider';
import { EmailController } from './email/email.controller';
import { EmailService } from './email/email.service';
import { PrismaModule } from '../prisma.module';
import { NotificationsService } from './notifications.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SmsController, PushController, EmailController],
  providers: [SmsService, SmscProvider, PushService, FcmProvider, EmailService, NotificationsService],
  exports: [SmsService, PushService, EmailService, NotificationsService],
})
export class NotificationsModule {}
