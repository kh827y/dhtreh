import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffRole, StaffStatus } from '@prisma/client';
import { hashPassword } from '../password.util';
import { PrismaService } from '../prisma.service';

interface MerchantFilters {
  search?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
}

export interface AdminMerchantListItem {
  id: string;
  name: string;
  createdAt: Date;
  archivedAt: Date | null;
  portalEmail: string | null;
  portalLoginEnabled: boolean;
  portalTotpEnabled: boolean;
  cashierLogin: string | null;
  ownerName: string | null;
  integrations: Array<{ id: string; provider: string; status: string | null }>;
}

export interface AdminMerchantDetail extends AdminMerchantListItem {
  settings: {
    qrTtlSec: number;
    requireBridgeSig: boolean;
    bridgeSecret: string | null;
    requireStaffKey: boolean;
    telegramBotToken: string | null;
    telegramBotUsername: string | null;
  };
}

export interface UpsertMerchantPayload {
  name?: string;
  portalEmail?: string | null;
  portalPassword?: string | null;
  ownerName?: string | null;
  archived?: boolean;
}

export interface UpdateMerchantSettingsPayload {
  qrTtlSec?: number;
  requireBridgeSig?: boolean;
  bridgeSecret?: string | null;
  requireStaffKey?: boolean;
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
}

@Injectable()
export class AdminMerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMerchants(
    filters: MerchantFilters = {},
  ): Promise<AdminMerchantListItem[]> {
    const where: Prisma.MerchantWhereInput = {};
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { portalEmail: { contains: filters.search, mode: 'insensitive' } },
        { cashierLogin: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.status === 'ACTIVE') {
      where.archivedAt = null;
    } else if (filters.status === 'ARCHIVED') {
      where.archivedAt = { not: null };
    }

    const merchants = await this.prisma.merchant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        staff: { where: { isOwner: true }, take: 1 },
        integrations: { select: { id: true, provider: true, isActive: true } },
      },
    });

    return merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      createdAt: merchant.createdAt,
      archivedAt: merchant.archivedAt ?? null,
      portalEmail: merchant.portalEmail ?? null,
      portalLoginEnabled: merchant.portalLoginEnabled,
      portalTotpEnabled: merchant.portalTotpEnabled,
      cashierLogin: merchant.cashierLogin ?? null,
      ownerName:
        merchant.staff[0]?.firstName ?? merchant.staff[0]?.lastName ?? null,
      integrations: merchant.integrations.map((integration) => ({
        id: integration.id,
        provider: integration.provider,
        status: integration.isActive ? 'ACTIVE' : 'INACTIVE',
      })),
    }));
  }

  async getMerchant(id: string): Promise<AdminMerchantDetail> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        staff: { where: { isOwner: true }, take: 1 },
        integrations: { select: { id: true, provider: true, isActive: true } },
        settings: true,
      },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const settings =
      merchant.settings ??
      (await this.prisma.merchantSettings.create({
        data: { merchantId: merchant.id },
      }));
    return {
      id: merchant.id,
      name: merchant.name,
      createdAt: merchant.createdAt,
      archivedAt: merchant.archivedAt ?? null,
      portalEmail: merchant.portalEmail ?? null,
      portalLoginEnabled: merchant.portalLoginEnabled,
      portalTotpEnabled: merchant.portalTotpEnabled,
      cashierLogin: merchant.cashierLogin ?? null,
      ownerName:
        merchant.staff[0]?.firstName ?? merchant.staff[0]?.lastName ?? null,
      integrations: merchant.integrations.map((integration) => ({
        id: integration.id,
        provider: integration.provider,
        status: integration.isActive ? 'ACTIVE' : 'INACTIVE',
      })),
      settings: {
        qrTtlSec: settings.qrTtlSec,
        requireBridgeSig: settings.requireBridgeSig,
        bridgeSecret: settings.bridgeSecret ?? null,
        requireStaffKey: settings.requireStaffKey,
        telegramBotToken: settings.telegramBotToken ?? null,
        telegramBotUsername: settings.telegramBotUsername ?? null,
      },
    };
  }

  private slugify(source: string): string {
    const map: Record<string, string> = {
      ё: 'e',
      й: 'i',
      ц: 'c',
      у: 'u',
      к: 'k',
      е: 'e',
      н: 'n',
      г: 'g',
      ш: 'sh',
      щ: 'sch',
      з: 'z',
      х: 'h',
      ъ: '',
      ф: 'f',
      ы: 'y',
      в: 'v',
      а: 'a',
      п: 'p',
      р: 'r',
      о: 'o',
      л: 'l',
      д: 'd',
      ж: 'zh',
      э: 'e',
      я: 'ya',
      ч: 'ch',
      с: 's',
      м: 'm',
      и: 'i',
      т: 't',
      ь: '',
      б: 'b',
      ю: 'yu',
    };
    const base = (source || '').toString().trim().toLowerCase();
    const translit = base
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9\-\s]/g, '')
      .replace(/\s+/g, '-');
    return translit.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'merchant';
  }

  private randomDigits(length: number): string {
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  private async ensureUniqueCashierLogin(
    tx: Prisma.TransactionClient,
    base: string,
  ): Promise<string> {
    const slug = this.slugify(base);
    for (let attempt = 0; attempt < 250; attempt += 1) {
      const candidate = attempt === 0 ? slug : `${slug}${attempt}`;
      const exists = await tx.merchant.findFirst({
        where: { cashierLogin: candidate },
      });
      if (!exists) return candidate;
    }
    return `${slug}${this.randomDigits(4)}`;
  }

  private async ensureOwnerLogin(
    tx: Prisma.TransactionClient,
    merchantId: string,
  ): Promise<string> {
    const base = 'owner';
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt}`;
      const exists = await tx.staff.findFirst({
        where: { merchantId, login: candidate },
      });
      if (!exists) return candidate;
    }
    return `${base}${this.randomDigits(3)}`;
  }

  async createMerchant(
    payload: UpsertMerchantPayload & {
      settings?: UpdateMerchantSettingsPayload;
    },
  ) {
    if (!payload.name?.trim())
      throw new BadRequestException('Name is required');
    if (payload.portalEmail) {
      const existingEmail = await this.prisma.merchant.findFirst({
        where: { portalEmail: payload.portalEmail },
      });
      if (existingEmail)
        throw new BadRequestException(
          'Portal email already used by another merchant',
        );
    }

    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: {
          name: payload.name!.trim(),
          portalEmail: payload.portalEmail?.trim().toLowerCase() ?? null,
          portalPasswordHash: payload.portalPassword
            ? await hashPassword(payload.portalPassword)
            : null,
          portalLoginEnabled: true,
          cashierLogin: await this.ensureUniqueCashierLogin(tx, payload.name!),
          cashierPassword9: this.randomDigits(9),
        },
      });

      await tx.merchantSettings.create({
        data: {
          merchantId: merchant.id,
          qrTtlSec: payload.settings?.qrTtlSec ?? 120,
          requireBridgeSig: payload.settings?.requireBridgeSig ?? false,
          bridgeSecret: payload.settings?.bridgeSecret ?? null,
          requireStaffKey: payload.settings?.requireStaffKey ?? false,
          telegramBotToken: payload.settings?.telegramBotToken ?? null,
          telegramBotUsername: payload.settings?.telegramBotUsername ?? null,
        },
      });

      const ownerLogin = await this.ensureOwnerLogin(tx, merchant.id);
      await tx.staff.create({
        data: {
          merchantId: merchant.id,
          login: ownerLogin,
          firstName: payload.ownerName?.trim() || 'Владелец',
          role: StaffRole.MERCHANT,
          status: StaffStatus.ACTIVE,
          portalState: 'ENABLED',
          portalAccessEnabled: true,
          canAccessPortal: true,
          isOwner: true,
        },
      });

      return this.getMerchant(merchant.id);
    });
  }

  async updateMerchant(id: string, payload: UpsertMerchantPayload) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { staff: { where: { isOwner: true }, take: 1 } },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    if (payload.portalEmail && payload.portalEmail !== merchant.portalEmail) {
      const existing = await this.prisma.merchant.findFirst({
        where: { portalEmail: payload.portalEmail, id: { not: id } },
      });
      if (existing) throw new BadRequestException('Portal email already used');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.merchant.update({
        where: { id },
        data: {
          name: payload.name?.trim() ?? merchant.name,
          portalEmail:
            payload.portalEmail?.trim().toLowerCase() ?? merchant.portalEmail,
          portalPasswordHash: payload.portalPassword
            ? await hashPassword(payload.portalPassword)
            : merchant.portalPasswordHash,
          archivedAt: payload.archived ? new Date() : null,
        },
      });

      if (payload.ownerName && merchant.staff[0]) {
        await tx.staff.update({
          where: { id: merchant.staff[0].id },
          data: {
            firstName: payload.ownerName,
          },
        });
      }
    });

    return this.getMerchant(id);
  }

  async updateSettings(
    merchantId: string,
    payload: UpdateMerchantSettingsPayload,
  ) {
    const settings = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      create: {
        merchantId,
        qrTtlSec: payload.qrTtlSec ?? 120,
        requireBridgeSig: payload.requireBridgeSig ?? false,
        bridgeSecret: payload.bridgeSecret ?? null,
        requireStaffKey: payload.requireStaffKey ?? false,
        telegramBotToken: payload.telegramBotToken ?? null,
        telegramBotUsername: payload.telegramBotUsername ?? null,
      },
      update: {
        ...(payload.qrTtlSec != null ? { qrTtlSec: payload.qrTtlSec } : {}),
        ...(payload.requireBridgeSig != null
          ? { requireBridgeSig: payload.requireBridgeSig }
          : {}),
        ...(payload.bridgeSecret !== undefined
          ? { bridgeSecret: payload.bridgeSecret }
          : {}),
        ...(payload.requireStaffKey != null
          ? { requireStaffKey: payload.requireStaffKey }
          : {}),
        ...(payload.telegramBotToken !== undefined
          ? { telegramBotToken: payload.telegramBotToken }
          : {}),
        ...(payload.telegramBotUsername !== undefined
          ? { telegramBotUsername: payload.telegramBotUsername }
          : {}),
      },
    });

    return {
      qrTtlSec: settings.qrTtlSec,
      requireBridgeSig: settings.requireBridgeSig,
      bridgeSecret: settings.bridgeSecret ?? null,
      requireStaffKey: settings.requireStaffKey,
      telegramBotToken: settings.telegramBotToken ?? null,
      telegramBotUsername: settings.telegramBotUsername ?? null,
    };
  }

  async rotateCashierCredentials(
    merchantId: string,
    regenerateLogin?: boolean,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!merchant) throw new NotFoundException('Merchant not found');
      const cashierLogin =
        regenerateLogin || !merchant.cashierLogin
          ? await this.ensureUniqueCashierLogin(tx, merchant.name)
          : merchant.cashierLogin;
      const cashierPassword9 = this.randomDigits(9);
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          cashierLogin,
          cashierPassword9,
          cashierPasswordUpdatedAt: new Date(),
        },
      });
      return { login: cashierLogin, password: cashierPassword9 };
    });
    return result;
  }
}
