import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PrismaModule } from '../prisma.module';
import { AdminAuditInterceptor } from '../admin-audit.interceptor';
import { AdminIpGuard } from '../admin-ip.guard';

@Module({
  imports: [PrismaModule],
  providers: [MerchantsService, AdminAuditInterceptor, AdminIpGuard],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
