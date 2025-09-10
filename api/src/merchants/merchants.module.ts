import { Module } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { PrismaModule } from '../prisma.module';
import { AdminAuditInterceptor } from '../admin-audit.interceptor';

@Module({
  imports: [PrismaModule],
  providers: [MerchantsService, AdminAuditInterceptor],
  controllers: [MerchantsController],
})
export class MerchantsModule {}
