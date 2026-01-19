import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { MerchantPanelService } from './merchant-panel.service';
import { StaffController } from './controllers/staff.controller';
import { AccessGroupsController } from './controllers/access-groups.controller';
import { CashierController } from './controllers/cashier.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { MetricsModule } from '../../core/metrics/metrics.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, MerchantsModule, MetricsModule, SubscriptionModule],
  providers: [MerchantPanelService, PortalGuard],
  controllers: [StaffController, AccessGroupsController, CashierController],
  exports: [MerchantPanelService],
})
export class MerchantPanelModule {}
