import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AdminGuard } from './admin.guard';
import { AdminIpGuard } from './admin-ip.guard';

@Controller('admin/audit')
@UseGuards(AdminGuard, AdminIpGuard)
export class AdminAuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Query('merchantId') merchantId?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (beforeStr) where.createdAt = { lt: new Date(beforeStr) };
    const items = await this.prisma.adminAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map((i) => ({
      id: i.id,
      createdAt: i.createdAt,
      actor: i.actor,
      method: i.method,
      path: i.path,
      merchantId: i.merchantId,
      action: i.action,
    }));
  }

  @Get('csv')
  async exportCsv(
    @Query('merchantId') merchantId?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 1000, 1), 5000)
      : 1000;
    const where: any = {};
    if (merchantId) where.merchantId = merchantId;
    if (beforeStr) where.createdAt = { lt: new Date(beforeStr) };
    const items = await this.prisma.adminAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const lines = ['createdAt,actor,method,path,merchantId,action'];
    for (const i of items) {
      const row = [
        i.createdAt.toISOString(),
        i.actor,
        i.method,
        i.path,
        i.merchantId || '',
        i.action || '',
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(',');
      lines.push(row);
    }
    return lines.join('\n') + '\n';
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    if (!id) throw new NotFoundException('Запись не найдена');
    const row = await this.prisma.adminAudit
      .findUnique({ where: { id } as any })
      .catch(() => null);
    if (!row) throw new NotFoundException('Запись не найдена');
    return {
      id: row.id,
      createdAt: row.createdAt,
      actor: row.actor,
      method: row.method,
      path: row.path,
      merchantId: row.merchantId,
      action: row.action,
      payload: row.payload ?? null,
    };
  }
}
