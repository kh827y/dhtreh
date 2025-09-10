import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { AdminAuditController } from './admin-audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminAuditController],
})
export class AdminAuditModule {}

