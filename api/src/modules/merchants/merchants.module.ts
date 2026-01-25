import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsAdminController } from './controllers/merchants-admin.controller';
import { MerchantsCashierController } from './controllers/merchants-cashier.controller';
import { MerchantsLedgerController } from './controllers/merchants-ledger.controller';
import { MerchantsOutboxController } from './controllers/merchants-outbox.controller';
import { MerchantsOutletsController } from './controllers/merchants-outlets.controller';
import { MerchantsPortalAuthController } from './controllers/merchants-portal-auth.controller';
import { MerchantsSettingsController } from './controllers/merchants-settings.controller';
import { MerchantsStaffController } from './controllers/merchants-staff.controller';
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
import { MerchantsAdminUseCase } from './use-cases/merchants-admin.use-case';
import { MerchantsCashierUseCase } from './use-cases/merchants-cashier.use-case';
import { MerchantsLedgerUseCase } from './use-cases/merchants-ledger.use-case';
import { MerchantsOutboxUseCase } from './use-cases/merchants-outbox.use-case';
import { MerchantsOutletsUseCase } from './use-cases/merchants-outlets.use-case';
import { MerchantsPortalAuthUseCase } from './use-cases/merchants-portal-auth.use-case';
import { MerchantsSettingsUseCase } from './use-cases/merchants-settings.use-case';
import { MerchantsStaffUseCase } from './use-cases/merchants-staff.use-case';

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
    MerchantsAdminUseCase,
    MerchantsCashierUseCase,
    MerchantsLedgerUseCase,
    MerchantsOutboxUseCase,
    MerchantsOutletsUseCase,
    MerchantsPortalAuthUseCase,
    MerchantsSettingsUseCase,
    MerchantsStaffUseCase,
    AdminAuditInterceptor,
    AdminIpGuard,
  ],
  controllers: [
    MerchantsAdminController,
    MerchantsSettingsController,
    MerchantsOutletsController,
    MerchantsStaffController,
    MerchantsOutboxController,
    MerchantsPortalAuthController,
    MerchantsCashierController,
    MerchantsLedgerController,
  ],
  exports: [MerchantsService],
})
export class MerchantsModule {}
