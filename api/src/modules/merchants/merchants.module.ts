import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, SubscriptionModule],
  providers: [MerchantsService, AdminAuditInterceptor, AdminIpGuard],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
