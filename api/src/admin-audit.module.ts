import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { AdminAuditController } from './admin-audit.controller';
import { AdminIpGuard } from './admin-ip.guard';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAuditController],
  providers: [AdminIpGuard],
})
export class AdminAuditModule {}

