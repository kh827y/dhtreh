import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffRole, StaffStatus } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { hashPassword, verifyPassword } from '../../../shared/password.util';
import { CreateStaffDto, UpdateStaffDto } from '../dto';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class MerchantsStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
  ) {}

  async listStaff(merchantId: string) {
    const staff = await this.prisma.staff.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    let accessMap = new Map<string, number>();
    try {
      const acc = await this.prisma.staffOutletAccess.groupBy({
        by: ['staffId'],
        where: { merchantId },
        _count: { _all: true },
      });
      accessMap = new Map<string, number>(
        acc.map((row) => [row.staffId, row._count?._all ?? 0]),
      );
    } catch (err) {
      logIgnoredError(
        err,
        'MerchantsStaffService access map',
        undefined,
        'debug',
      );
    }
    let lastMap = new Map<string, Date | null>();
    try {
      const tx = await this.prisma.transaction.groupBy({
        by: ['staffId'],
        where: { merchantId, staffId: { not: null } },
        _max: { createdAt: true },
      });
      lastMap = new Map<string, Date | null>(
        tx
          .filter((row) => row.staffId)
          .map((row) => [row.staffId as string, row._max?.createdAt ?? null]),
      );
    } catch (err) {
      logIgnoredError(
        err,
        'MerchantsStaffService last activity',
        undefined,
        'debug',
      );
    }
    return staff.map((s) => ({
      ...s,
      outletsCount: accessMap.get(s.id) || 0,
      lastActivityAt: lastMap.get(s.id) || null,
    }));
  }

  async createStaff(merchantId: string, dto: CreateStaffDto) {
    await this.ensureMerchant(merchantId);
    const role = dto.role ? (dto.role as StaffRole) : StaffRole.CASHIER;
    const data: Prisma.StaffUncheckedCreateInput = {
      merchantId,
      login:
        dto.login != null && String(dto.login).trim()
          ? String(dto.login).trim()
          : null,
      email:
        dto.email != null && String(dto.email).trim()
          ? String(dto.email).trim().toLowerCase()
          : null,
      role,
      firstName:
        dto.firstName != null && String(dto.firstName).trim()
          ? String(dto.firstName).trim()
          : null,
      lastName:
        dto.lastName != null && String(dto.lastName).trim()
          ? String(dto.lastName).trim()
          : null,
      position:
        dto.position != null && String(dto.position).trim()
          ? String(dto.position).trim()
          : null,
      phone:
        dto.phone != null && String(dto.phone).trim()
          ? String(dto.phone).trim()
          : null,
      comment:
        dto.comment != null && String(dto.comment).trim()
          ? String(dto.comment).trim()
          : null,
      avatarUrl:
        dto.avatarUrl != null && String(dto.avatarUrl).trim()
          ? String(dto.avatarUrl).trim()
          : null,
      canAccessPortal: !!dto.canAccessPortal,
    };
    if (dto.password != null) {
      const password = String(dto.password);
      if (!password || password.length < 6)
        throw new BadRequestException('password too short');
      data.hash = hashPassword(password);
      data.canAccessPortal = true;
    }
    const created = await this.prisma.staff.create({ data });
    this.cache.invalidateStaff(merchantId, created.id);
    return created;
  }

  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const data: Prisma.StaffUncheckedUpdateInput = {};
    if (dto.login !== undefined)
      data.login =
        dto.login != null && String(dto.login).trim()
          ? String(dto.login).trim()
          : null;
    if (dto.email !== undefined)
      data.email =
        dto.email != null && String(dto.email).trim()
          ? String(dto.email).trim().toLowerCase()
          : null;
    if (dto.role !== undefined) data.role = dto.role as StaffRole;
    if (dto.status !== undefined) data.status = dto.status as StaffStatus;
    if (dto.allowedOutletId !== undefined)
      data.allowedOutletId = dto.allowedOutletId || null;
    if (dto.firstName !== undefined)
      data.firstName =
        dto.firstName != null && String(dto.firstName).trim()
          ? String(dto.firstName).trim()
          : null;
    if (dto.lastName !== undefined)
      data.lastName =
        dto.lastName != null && String(dto.lastName).trim()
          ? String(dto.lastName).trim()
          : null;
    if (dto.position !== undefined)
      data.position =
        dto.position != null && String(dto.position).trim()
          ? String(dto.position).trim()
          : null;
    if (dto.phone !== undefined)
      data.phone =
        dto.phone != null && String(dto.phone).trim()
          ? String(dto.phone).trim()
          : null;
    if (dto.comment !== undefined)
      data.comment =
        dto.comment != null && String(dto.comment).trim()
          ? String(dto.comment).trim()
          : null;
    if (dto.avatarUrl !== undefined)
      data.avatarUrl =
        dto.avatarUrl != null && String(dto.avatarUrl).trim()
          ? String(dto.avatarUrl).trim()
          : null;
    if (dto.canAccessPortal !== undefined) {
      data.canAccessPortal = !!dto.canAccessPortal;
      if (!dto.canAccessPortal) data.hash = null;
    }
    if (dto.password !== undefined) {
      const password = String(dto.password || '');
      if (!password || password.length < 6)
        throw new BadRequestException('password too short');
      if (dto.currentPassword !== undefined) {
        const current = String(dto.currentPassword || '');
        if (!current || !user.hash || !verifyPassword(current, user.hash))
          throw new BadRequestException('current password invalid');
      }
      data.hash = hashPassword(password);
      data.canAccessPortal = true;
    }
    if (
      dto.canAccessPortal === false ||
      dto.password !== undefined ||
      dto.status === StaffStatus.FIRED
    ) {
      data.portalTokensRevokedAt = new Date();
      data.portalRefreshTokenHash = null;
    }
    const updated = await this.prisma.staff.update({
      where: { id: staffId },
      data,
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return updated;
  }

  async deleteStaff(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    await this.prisma.staff.delete({ where: { id: staffId } });
    this.cache.invalidateStaff(merchantId, staffId);
    return { ok: true };
  }

  private async ensureMerchant(merchantId: string) {
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId, initialName: merchantId },
    });
  }
}
