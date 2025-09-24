import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { MerchantPanelService } from './merchant-panel.service';
import { StaffController } from './controllers/staff.controller';
import { AccessGroupsController } from './controllers/access-groups.controller';
import { OutletsController } from './controllers/outlets.controller';
import { CashierController } from './controllers/cashier.controller';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [PrismaModule, MerchantsModule],
  providers: [MerchantPanelService],
  controllers: [StaffController, AccessGroupsController, OutletsController, CashierController],
  exports: [MerchantPanelService],
})
export class MerchantPanelModule {}
