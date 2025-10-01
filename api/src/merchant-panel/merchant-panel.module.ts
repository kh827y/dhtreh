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
import { MetricsModule } from '../metrics.module';
import { ReviewModule } from '../reviews/review.module';
import { ReviewsController } from './controllers/reviews.controller';

@Module({
  imports: [PrismaModule, MerchantsModule, MetricsModule, ReviewModule],
  providers: [MerchantPanelService, PortalGuard, StaffResolver, AccessGroupsResolver, OutletsResolver, CashierResolver],
  controllers: [StaffController, AccessGroupsController, OutletsController, CashierController, ReviewsController],
  exports: [MerchantPanelService],
})
export class MerchantPanelModule {}
