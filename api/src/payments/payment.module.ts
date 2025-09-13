import { Module, forwardRef } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { YooKassaProvider } from './providers/yookassa.provider';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider';
import { TinkoffProvider } from './providers/tinkoff.provider';
import { PrismaModule } from '../prisma.module';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => SubscriptionModule)],
  controllers: [PaymentController],
  providers: [PaymentService, YooKassaProvider, CloudPaymentsProvider, TinkoffProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
