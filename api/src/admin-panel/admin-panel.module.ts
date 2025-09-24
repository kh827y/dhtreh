import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AdminMerchantsController } from './admin-merchants.controller';
import { AdminMerchantsService } from './admin-merchants.service';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [PrismaModule, MerchantsModule],
  controllers: [AdminMerchantsController],
  providers: [AdminMerchantsService],
  exports: [AdminMerchantsService],
})
export class AdminPanelModule {}
