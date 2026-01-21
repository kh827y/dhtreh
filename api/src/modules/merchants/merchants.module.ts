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
import { MerchantsAntifraudService } from './services/merchants-antifraud.service';
import { MerchantsLedgerService } from './services/merchants-ledger.service';
import { MerchantsAdminService } from './services/merchants-admin.service';
import { MerchantsPortalAuthService } from './services/merchants-portal-auth.service';
import { MerchantsIntegrationsService } from './services/merchants-integrations.service';

@Module({
  imports: [PrismaModule, SubscriptionModule],
  providers: [
    MerchantsService,
    MerchantsSettingsService,
    MerchantsAccessService,
    MerchantsStaffService,
    MerchantsOutletsService,
    MerchantsOutboxService,
    MerchantsAntifraudService,
    MerchantsLedgerService,
    MerchantsAdminService,
    MerchantsPortalAuthService,
    MerchantsIntegrationsService,
    AdminAuditInterceptor,
    AdminIpGuard,
  ],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
