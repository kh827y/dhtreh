import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAuditController],
  providers: [AdminIpGuard],
})
export class AdminAuditModule {}
