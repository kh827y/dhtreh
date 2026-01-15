import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffRole, StaffStatus } from '@prisma/client';
import { hashPassword } from '../password.util';
import { PrismaService } from '../prisma.service';
import {
  SubscriptionService,
  type SubscriptionState,
  FULL_PLAN_ID,
} from '../subscription/subscription.service';
import { createAccessGroupsFromPresets } from '../access-group-presets';

interface MerchantFilters {
  search?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'ALL';
}

export interface AdminMerchantListItem {
  id: string;
  name: string;
  initialName: string;
  createdAt: Date;
  archivedAt: Date | null;
  portalEmail: string | null;
  portalLoginEnabled: boolean;
  portalTotpEnabled: boolean;
  cashierLogin: string | null;
  ownerName: string | null;
  integrations: Array<{ id: string; provider: string; status: string | null }>;
  subscription: AdminMerchantSubscriptionInfo;
}

export interface AdminMerchantDetail extends AdminMerchantListItem {
  settings: {
    qrTtlSec: number;
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
  telegramBotToken?: string | null;
  telegramBotUsername?: string | null;
}

export type AdminMerchantSubscriptionInfo = {
  status: SubscriptionState['status'];
  planId: string | null;
  planName: string | null;
  currentPeriodEnd: Date | null;
  daysLeft: number | null;
  expiresSoon: boolean;
  expired: boolean;
};

@Injectable()
export class AdminMerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService,
  ) {}

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
        subscription: { include: { plan: true } },
      },
    });

    return merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      initialName: merchant.initialName,
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
      subscription: this.normalizeSubscription(merchant.subscription),
    }));
  }

  async getMerchant(id: string): Promise<AdminMerchantDetail> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: {
        staff: { where: { isOwner: true }, take: 1 },
        integrations: { select: { id: true, provider: true, isActive: true } },
        settings: true,
        subscription: { include: { plan: true } },
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
      initialName: merchant.initialName,
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
      subscription: this.normalizeSubscription(merchant.subscription),
      settings: {
        qrTtlSec: settings.qrTtlSec,
        telegramBotToken: null,
        telegramBotUsername: settings.telegramBotUsername ?? null,
      },
    };
  }

  private normalizeSubscription(
    raw: any | null,
  ): AdminMerchantSubscriptionInfo {
    const state = this.subscriptions.buildStateFromRecord(raw);
    return {
      status: state.status,
      planId: state.planId,
      planName: state.planName,
      currentPeriodEnd: state.currentPeriodEnd,
      daysLeft: state.daysLeft,
      expiresSoon: state.expiresSoon,
      expired: state.expired,
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
    const normalizedEmail = normalizeEmail(payload.portalEmail);
    if (normalizedEmail) {
      const existingEmail = await this.prisma.merchant.findFirst({
        where: { portalEmail: normalizedEmail },
      });
      if (existingEmail)
        throw new BadRequestException(
          'Portal email already used by another merchant',
        );
    }

    return this.prisma.$transaction(async (tx) => {
      const portalEmail = normalizedEmail ?? null;
      const portalPasswordHash = payload.portalPassword
        ? await hashPassword(payload.portalPassword)
        : null;
      const portalLoginEnabled = Boolean(portalEmail && portalPasswordHash);
      const merchant = await tx.merchant.create({
        data: {
          name: payload.name!.trim(),
          initialName: payload.name!.trim(),
          portalEmail,
          portalPasswordHash,
          portalLoginEnabled,
          cashierLogin: await this.ensureUniqueCashierLogin(tx, payload.name!),
        },
      });

      await tx.merchantSettings.create({
        data: {
          merchantId: merchant.id,
          qrTtlSec: payload.settings?.qrTtlSec ?? 300,
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
      await createAccessGroupsFromPresets(tx, merchant.id);

      return this.getMerchant(merchant.id);
    });
  }

  async updateMerchant(id: string, payload: UpsertMerchantPayload) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id },
      include: { staff: { where: { isOwner: true }, take: 1 } },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const normalizedEmail =
      payload.portalEmail === undefined
        ? undefined
        : normalizeEmail(payload.portalEmail);
    if (normalizedEmail && normalizedEmail !== merchant.portalEmail) {
      const existing = await this.prisma.merchant.findFirst({
        where: { portalEmail: normalizedEmail, id: { not: id } },
      });
      if (existing) throw new BadRequestException('Portal email already used');
    }

    await this.prisma.$transaction(async (tx) => {
      const portalEmail =
        normalizedEmail === undefined ? merchant.portalEmail : normalizedEmail;
      let portalPasswordHash =
        payload.portalPassword === undefined
          ? merchant.portalPasswordHash
          : payload.portalPassword
            ? await hashPassword(payload.portalPassword)
            : null;
      if (portalEmail === null) {
        portalPasswordHash = null;
      }
      const portalLoginEnabled =
        normalizedEmail !== undefined || payload.portalPassword !== undefined
          ? Boolean(portalEmail && portalPasswordHash)
          : merchant.portalLoginEnabled;
      const credentialsChanged =
        portalEmail !== merchant.portalEmail ||
        portalPasswordHash !== merchant.portalPasswordHash ||
        portalLoginEnabled !== merchant.portalLoginEnabled;
      await tx.merchant.update({
        where: { id },
        data: {
          name: payload.name?.trim() ?? merchant.name,
          portalEmail,
          portalPasswordHash,
          portalLoginEnabled,
          ...(credentialsChanged
            ? {
                portalTokensRevokedAt: new Date(),
                portalRefreshTokenHash: null,
              }
            : {}),
          archivedAt:
            payload.archived === undefined
              ? merchant.archivedAt
              : payload.archived
                ? new Date()
                : null,
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
        qrTtlSec: payload.qrTtlSec ?? 300,
        telegramBotToken: payload.telegramBotToken ?? null,
        telegramBotUsername: payload.telegramBotUsername ?? null,
      },
      update: {
        ...(payload.qrTtlSec != null ? { qrTtlSec: payload.qrTtlSec } : {}),
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
      telegramBotToken: null,
      telegramBotUsername: settings.telegramBotUsername ?? null,
    };
  }

  async grantSubscription(merchantId: string, days: number, planId?: string) {
    const planToUse = planId?.trim() || FULL_PLAN_ID;
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return this.subscriptions.grantSubscription(merchantId, planToUse, days);
  }

  async resetSubscription(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return this.subscriptions.resetSubscription(merchantId);
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
      await tx.merchant.update({
        where: { id: merchantId },
        data: {
          cashierLogin,
        },
      });
      return { login: cashierLogin };
    });
    return result;
  }
}

function normalizeEmail(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}
