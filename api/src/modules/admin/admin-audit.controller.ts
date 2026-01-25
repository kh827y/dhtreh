import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  NotFoundException,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AdminGuard } from '../../core/guards/admin.guard';
import { AdminIpGuard } from '../../core/guards/admin-ip.guard';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

@Controller('admin/audit')
@UseGuards(AdminGuard, AdminIpGuard)
export class AdminAuditController {
  constructor(private prisma: PrismaService) {}

  private parseBefore(beforeStr?: string) {
    if (!beforeStr) return null;
    const parsed = new Date(beforeStr);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректная дата before');
    }
    return parsed;
  }

  @Get()
  async list(
    @Query('merchantId') merchantId?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const where: Prisma.AdminAuditWhereInput = {};
    if (merchantId) where.merchantId = merchantId;
    const before = this.parseBefore(beforeStr);
    if (before) where.createdAt = { lt: before };
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
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="admin-audit.csv"')
  async exportCsv(
    @Query('merchantId') merchantId?: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 1000, 1), 5000)
      : 1000;
    const where: Prisma.AdminAuditWhereInput = {};
    if (merchantId) where.merchantId = merchantId;
    const before = this.parseBefore(beforeStr);
    if (before) where.createdAt = { lt: before };
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
      .findUnique({ where: { id } })
      .catch((err) => {
        logIgnoredError(err, 'AdminAuditController get one', undefined, 'debug', {
          id,
        });
        return null;
      });
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
