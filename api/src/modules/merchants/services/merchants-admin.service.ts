import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { hashPassword } from '../../../shared/password.util';
import { createAccessGroupsFromPresets } from '../../../shared/access-group-presets';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import {
  ensureUniqueCashierLogin,
  randomPin4,
  slugify,
} from '../merchants.helpers';

@Injectable()
export class MerchantsAdminService {
  private readonly logger = new Logger(MerchantsAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  listMerchants() {
    return this.prisma.merchant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        initialName: true,
        createdAt: true,
        portalLoginEnabled: true,
        portalTotpEnabled: true,
        portalEmail: true,
        settings: {
          select: {
            earnBps: true,
            redeemLimitBps: true,
            qrTtlSec: true,
            maxOutlets: true,
          },
        },
        subscription: { include: { plan: true } },
      },
    });
  }

  async createMerchant(
    name: string,
    email: string,
    password: string,
    ownerName?: string,
    maxOutlets?: number | null,
  ) {
    if (!name || !name.trim()) throw new BadRequestException('name required');
    const em = String(email || '')
      .trim()
      .toLowerCase();
    if (!em) throw new BadRequestException('login required');
    if (!password || String(password).length < 6)
      throw new BadRequestException('password too short');
    const parsedMaxOutlets = maxOutlets == null ? null : Number(maxOutlets);
    if (parsedMaxOutlets != null) {
      if (
        !Number.isFinite(parsedMaxOutlets) ||
        parsedMaxOutlets < 1 ||
        !Number.isInteger(parsedMaxOutlets)
      ) {
        throw new BadRequestException('Лимит торговых точек должен быть >= 1');
      }
    }
    const pwd = hashPassword(String(password));
    // slug для логина кассира + уникальность
    const baseSlug = slugify(name.trim());
    const uniqueSlug = await ensureUniqueCashierLogin(this.prisma, baseSlug);
    const m = await this.prisma.merchant.create({
      data: {
        name: name.trim(),
        initialName: name.trim(),
        portalEmail: em,
        portalPasswordHash: pwd,
        cashierLogin: uniqueSlug,
      },
    });
    if (parsedMaxOutlets != null) {
      await this.prisma.merchantSettings.create({
        data: { merchantId: m.id, maxOutlets: parsedMaxOutlets },
      });
    }
    // Автосоздание сотрудника-владельца с флагами и пинкодом (минимальный профиль до полной миграции UI)
    if (ownerName && ownerName.trim()) {
      const [firstName, ...rest] = ownerName.trim().split(/\s+/);
      const lastName = rest.join(' ');
      const pinCode = randomPin4();
      try {
        await this.prisma.staff.create({
          data: {
            merchantId: m.id,
            login: ownerName.trim(),
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            role: StaffRole.MERCHANT,
            isOwner: true,
            canAccessPortal: true,
            pinCode,
          },
        });
      } catch (err) {
        logIgnoredError(
          err,
          'MerchantsAdminService create owner staff',
          this.logger,
          'debug',
        );
      }
    }
    await createAccessGroupsFromPresets(this.prisma, m.id);
    return {
      id: m.id,
      name: m.name,
      initialName: m.initialName,
      email: m.portalEmail,
    };
  }

  async updateMerchant(
    id: string,
    dto: { name?: string; email?: string; password?: string },
  ) {
    const m = await this.prisma.merchant.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Merchant not found');
    const data: Prisma.MerchantUpdateInput = {};
    if (dto.name != null) data.name = String(dto.name).trim();
    if (dto.email != null)
      data.portalEmail = String(dto.email).trim().toLowerCase() || null;
    if (dto.password != null) {
      if (!dto.password || String(dto.password).length < 6)
        throw new BadRequestException('password too short');
      data.portalPasswordHash = hashPassword(String(dto.password));
    }
    if (
      data.portalEmail !== undefined ||
      data.portalPasswordHash !== undefined
    ) {
      data.portalTokensRevokedAt = new Date();
      data.portalRefreshTokenHash = null;
    }
    const res = await this.prisma.merchant.update({
      where: { id },
      data,
    });
    return {
      id: res.id,
      name: res.name,
      initialName: res.initialName,
      email: res.portalEmail,
    };
  }

  async getMerchantName(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { name: true, initialName: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return { name: merchant.name, initialName: merchant.initialName };
  }

  async updateMerchantName(merchantId: string, rawName: string) {
    const nextName = String(rawName || '').trim();
    if (!nextName)
      throw new BadRequestException('Название не может быть пустым');
    if (nextName.length > 120)
      throw new BadRequestException('Название должно быть короче 120 символов');

    const current = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { initialName: true },
    });
    if (!current) throw new NotFoundException('Merchant not found');

    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: {
        name: nextName,
        ...(current.initialName ? {} : { initialName: nextName }),
      },
      select: { name: true, initialName: true },
    });
    return updated;
  }

  async deleteMerchant(id: string) {
    const m = await this.prisma.merchant.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Merchant not found');
    try {
      await this.prisma.merchant.delete({ where: { id } });
      return { ok: true };
    } catch (err) {
      logIgnoredError(
        err,
        'MerchantsAdminService delete fallback',
        this.logger,
        'debug',
      );
      // Fallback: мягкое отключение, если есть зависимости
      await this.prisma.merchant.update({
        where: { id },
        data: {
          portalLoginEnabled: false,
          portalEmail: null,
          portalTokensRevokedAt: new Date(),
          portalRefreshTokenHash: null,
        },
      });
      return { ok: true };
    }
  }
}
