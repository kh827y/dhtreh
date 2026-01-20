import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { SubscriptionModule } from '../subscription/subscription.module';
import { MerchantsSettingsService } from './services/merchants-settings.service';
import { MerchantsAccessService } from './services/merchants-access.service';
import { MerchantsStaffService } from './services/merchants-staff.service';
import { MerchantsOutletsService } from './services/merchants-outlets.service';
import { MerchantsOutboxService } from './services/merchants-outbox.service';

@Module({
  imports: [PrismaModule, SubscriptionModule],
  providers: [
    MerchantsService,
    MerchantsSettingsService,
    MerchantsAccessService,
    MerchantsStaffService,
    MerchantsOutletsService,
    MerchantsOutboxService,
    AdminAuditInterceptor,
    AdminIpGuard,
  ],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
