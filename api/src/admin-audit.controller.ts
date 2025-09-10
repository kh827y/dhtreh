import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin/audit')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Query('merchantId') merchantId?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200) : 50;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (beforeStr) where.createdAt = { lt: new Date(beforeStr) };
    const items = await this.prisma.adminAudit.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    return items.map(i => ({
      id: i.id,
      createdAt: i.createdAt,
      actor: i.actor,
      method: i.method,
      path: i.path,
      merchantId: i.merchantId,
      action: i.action,
    }));
  }
}

