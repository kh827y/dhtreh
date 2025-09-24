import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MerchantPanelService } from './merchant-panel.service';
import { StaffController } from './controllers/staff.controller';
import { AccessGroupsController } from './controllers/access-groups.controller';
import { OutletsController } from './controllers/outlets.controller';
import { CashierController } from './controllers/cashier.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { PortalGuard } from '../portal-auth/portal.guard';
import { StaffResolver } from './resolvers/staff.resolver';
import { AccessGroupsResolver } from './resolvers/access-groups.resolver';
import { OutletsResolver } from './resolvers/outlets.resolver';
import { CashierResolver } from './resolvers/cashier.resolver';

@Module({
  imports: [PrismaModule, MerchantsModule],
  providers: [MerchantPanelService, PortalGuard, StaffResolver, AccessGroupsResolver, OutletsResolver, CashierResolver],

  controllers: [StaffController, AccessGroupsController, OutletsController, CashierController],
  exports: [MerchantPanelService],
})
export class MerchantPanelModule {}
