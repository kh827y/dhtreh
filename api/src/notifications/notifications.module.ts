import { Module } from '@nestjs/common';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { EmailController } from './email/email.controller';
import { EmailService } from './email/email.service';
import { PrismaModule } from '../prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [PrismaModule, ConfigModule, TelegramModule],
  controllers: [PushController, EmailController, NotificationsController],
  providers: [PushService, EmailService, NotificationsService],
  exports: [PushService, EmailService, NotificationsService],
})
export class NotificationsModule {}
