import { BadRequestException, Injectable } from '@nestjs/common';
import { CommunicationChannel, Prisma } from '@prisma/client';
import { assertPortalPermissions } from '../../portal-auth/portal-permissions.util';
import { MerchantsService } from '../../merchants/merchants.service';
import {
  UpdateMerchantSettingsDto,
  UpdateMerchantNameDto,
  UpdateTimezoneDto,
} from '../../merchants/dto';
import {
  StaffMotivationService,
  type UpdateStaffMotivationPayload,
} from '../services/staff-motivation.service';
import { ReferralService } from '../../referral/referral.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  RUSSIA_TIMEZONES,
  serializeTimezone,
} from '../../../shared/timezone/russia-timezones';
import {
  ensureRulesRoot,
  getRulesRoot,
  getRulesSection,
  setRulesSection,
} from '../../../shared/rules-json.util';
import {
  PortalControllerHelpers,
  type PortalRequest,
  type UploadedFile as UploadedFilePayload,
} from '../controllers/portal.controller-helpers';

export const MAX_MINIAPP_LOGO_BYTES = 512 * 1024;
const ALLOWED_MINIAPP_LOGO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

@Injectable()
export class PortalSettingsUseCase {
  constructor(
    private readonly service: MerchantsService,
    private readonly prisma: PrismaService,
    private readonly staffMotivation: StaffMotivationService,
    private readonly referrals: ReferralService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  getStaffMotivation(req: PortalRequest) {
    return this.staffMotivation.getSettings(this.helpers.getMerchantId(req));
  }

  updateStaffMotivation(
    req: PortalRequest,
    body: UpdateStaffMotivationPayload,
  ) {
    return this.staffMotivation.updateSettings(this.helpers.getMerchantId(req), {
      enabled: !!body?.enabled,
      pointsForNewCustomer: Number(body?.pointsForNewCustomer ?? 0),
      pointsForExistingCustomer: Number(body?.pointsForExistingCustomer ?? 0),
      leaderboardPeriod: body?.leaderboardPeriod ?? 'week',
      customDays:
        body?.customDays === undefined || body?.customDays === null
          ? null
          : Number(body.customDays),
    });
  }

  referralProgramSettings(req: PortalRequest) {
    return this.referrals.getProgramSettingsForMerchant(
      this.helpers.getMerchantId(req),
    );
  }

  updateReferralProgramSettings(req: PortalRequest, body: unknown) {
    const payload = this.helpers.normalizeReferralProgramPayload(body);
    return this.referrals.updateProgramSettingsFromPortal(
      this.helpers.getMerchantId(req),
      payload,
    );
  }

  async ttlReminderForecast(req: PortalRequest, daysBeforeStr?: string) {
    assertPortalPermissions(req, ['mechanic_ttl'], 'read');
    const merchantId = this.helpers.getMerchantId(req);
    const rawDays = Number(daysBeforeStr ?? NaN);
    const daysBefore = Number.isFinite(rawDays)
      ? Math.min(90, Math.max(1, Math.floor(rawDays)))
      : 3;

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { telegramBotEnabled: true },
    });
    if (!merchant?.telegramBotEnabled) {
      return { count: 0, daysBefore };
    }

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { pointsTtlDays: true },
    });
    const ttlDaysRaw = Number(settings?.pointsTtlDays ?? 0);
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0
        ? Math.floor(ttlDaysRaw)
        : 0;
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + daysBefore * 24 * 60 * 60 * 1000,
    );

    const conditions: Prisma.EarnLotWhereInput[] = [
      { expiresAt: { gt: now, lte: windowEnd } },
    ];
    if (ttlDays > 0) {
      const lowerBound = new Date(
        now.getTime() - ttlDays * 24 * 60 * 60 * 1000,
      );
      const upperBound = new Date(
        windowEnd.getTime() - ttlDays * 24 * 60 * 60 * 1000,
      );
      conditions.push({
        expiresAt: null,
        earnedAt: { gt: lowerBound, lte: upperBound },
        orderId: { not: null },
        NOT: [
          { orderId: 'registration_bonus' },
          { orderId: 'manual_accrual' },
          { orderId: 'manual_accrual_legacy' },
          { orderId: 'manual_accrual_portal' },
          { orderId: 'manual_accrual_portal_legacy' },
        ],
      });
    }

    const lots = await this.prisma.earnLot.findMany({
      where: {
        merchantId,
        points: { gt: 0 },
        OR: conditions,
      },
      select: {
        customerId: true,
        points: true,
        consumedPoints: true,
        expiresAt: true,
        earnedAt: true,
      },
    });

    if (!lots.length) {
      return { count: 0, daysBefore };
    }

    const ttlMs = ttlDays > 0 ? ttlDays * 24 * 60 * 60 * 1000 : 0;
    const customers = new Map<string, number>();
    for (const lot of lots) {
      const remaining = Math.max(0, lot.points - (lot.consumedPoints || 0));
      if (remaining <= 0) continue;
      const burnDate =
        lot.expiresAt ??
        (ttlMs > 0 ? new Date(lot.earnedAt.getTime() + ttlMs) : null);
      if (!burnDate) continue;
      if (burnDate <= now || burnDate > windowEnd) continue;
      const burnTime = burnDate.getTime();
      const existing = customers.get(lot.customerId);
      if (existing == null || burnTime < existing) {
        customers.set(lot.customerId, burnTime);
      }
    }

    const customerIds = Array.from(customers.keys());
    if (!customerIds.length) {
      return { count: 0, daysBefore };
    }

    const count = await this.prisma.customer.count({
      where: {
        merchantId,
        id: { in: customerIds },
        tgId: { not: null },
      },
    });

    return { count, daysBefore };
  }

  getSettings(req: PortalRequest) {
    this.helpers.assertSettingsReadAccess(req);
    return this.service
      .getSettings(this.helpers.getMerchantId(req))
      .then((data) =>
        this.helpers.filterSettingsByPermissions(
          req,
          this.helpers.maskSettingsSecrets(req, data),
        ),
      );
  }

  async updateSettings(req: PortalRequest, dto: UpdateMerchantSettingsDto) {
    const id = this.helpers.getMerchantId(req);
    const current = await this.prisma.merchantSettings.findUnique({
      where: { merchantId: id },
    });
    this.helpers.assertSettingsUpdateAccess(req, current, dto);
    const updated = await this.service.updateSettings(
      id,
      dto.earnBps,
      dto.redeemLimitBps,
      dto.qrTtlSec,
      dto.webhookUrl,
      dto.webhookSecret,
      dto.webhookKeyId,
      dto.redeemCooldownSec,
      dto.earnCooldownSec,
      dto.redeemDailyCap,
      dto.earnDailyCap,
      dto.requireJwtForQuote,
      dto.rulesJson,
      dto,
    );
    return this.helpers.filterSettingsByPermissions(
      req,
      this.helpers.maskSettingsSecrets(req, updated),
    );
  }

  getMerchantName(req: PortalRequest) {
    return this.service.getMerchantName(this.helpers.getMerchantId(req));
  }

  async updateMerchantName(req: PortalRequest, dto: UpdateMerchantNameDto) {
    const payload = await this.service.updateMerchantName(
      this.helpers.getMerchantId(req),
      dto.name,
    );
    return { ok: true, ...payload };
  }

  async getTimezoneSetting(req: PortalRequest) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezone = await this.service.getTimezone(merchantId);
    return {
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
  }

  async updateTimezoneSetting(req: PortalRequest, dto: UpdateTimezoneDto) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezone = await this.service.updateTimezone(merchantId, dto.code);
    return {
      ok: true,
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
  }

  async getSupportSetting(req: PortalRequest) {
    const merchantId = this.helpers.getMerchantId(req);
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules = getRulesRoot(settings?.rulesJson) ?? {};
    const miniapp = getRulesSection(rules, 'miniapp');
    const supportTelegramRaw = miniapp?.supportTelegram ?? null;
    const supportTelegram =
      typeof supportTelegramRaw === 'string' && supportTelegramRaw.trim()
        ? supportTelegramRaw.trim()
        : null;
    return { supportTelegram };
  }

  async updateSupportSetting(req: PortalRequest, body: unknown) {
    const merchantId = this.helpers.getMerchantId(req);
    const payload = this.helpers.asRecord(body);
    const rawValue =
      typeof payload.supportTelegram === 'string'
        ? payload.supportTelegram
        : '';
    const supportTelegram = rawValue.trim() ? rawValue.trim() : null;
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const rules = ensureRulesRoot(settings?.rulesJson);
    const miniapp = { ...(getRulesSection(rules, 'miniapp') ?? {}) };
    miniapp.supportTelegram = supportTelegram;
    const nextRules = setRulesSection(rules, 'miniapp', miniapp);
    this.service.validateRules(nextRules);
    const nextRulesJson = nextRules as Prisma.InputJsonValue;
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: {
        id: merchantId,
        name: merchantId,
        initialName: merchantId,
      },
    });
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson: nextRulesJson },
      create: { merchantId, rulesJson: nextRulesJson },
    });
    return { supportTelegram };
  }

  async getMiniappLogo(req: PortalRequest) {
    assertPortalPermissions(req, ['system_settings'], 'read');
    const merchantId = this.helpers.getMerchantId(req);
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { miniappLogoUrl: true },
    });
    return { miniappLogoUrl: settings?.miniappLogoUrl ?? null };
  }

  async uploadMiniappLogo(req: PortalRequest, file: UploadedFilePayload) {
    const merchantId = this.helpers.getMerchantId(req);
    const current = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { miniappLogoUrl: true },
    });
    this.helpers.assertSettingsUpdateAccess(req, current, {
      miniappLogoUrl: 'upload',
    } as UpdateMerchantSettingsDto);
    if (!file || !file.buffer) {
      throw new BadRequestException('Файл не найден');
    }
    const size = Number(file.size ?? file.buffer.length ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      throw new BadRequestException('Пустой файл');
    }
    if (size > MAX_MINIAPP_LOGO_BYTES) {
      throw new BadRequestException('Размер файла не должен превышать 512KB');
    }
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MINIAPP_LOGO_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException('Поддерживаются PNG, JPG, SVG или WEBP');
    }
    const fileName =
      typeof file.originalname === 'string' && file.originalname.trim()
        ? file.originalname.trim()
        : 'logo';
    const asset = await this.prisma.communicationAsset.create({
      data: {
        merchantId,
        channel: CommunicationChannel.INAPP,
        kind: 'MINIAPP_LOGO',
        fileName,
        mimeType,
        byteSize: size,
        data: file.buffer,
      },
      select: { id: true },
    });
    const miniappLogoUrl = this.helpers.buildMiniappLogoPath(
      merchantId,
      asset.id,
    );
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { miniappLogoUrl, updatedAt: new Date() },
      create: { merchantId, miniappLogoUrl },
    });
    const previousAssetId = this.helpers.extractMiniappLogoAssetId(
      current?.miniappLogoUrl ?? null,
    );
    if (previousAssetId && previousAssetId !== asset.id) {
      await this.prisma.communicationAsset.deleteMany({
        where: {
          id: previousAssetId,
          merchantId,
          kind: 'MINIAPP_LOGO',
        },
      });
    }
    return { miniappLogoUrl };
  }

  async deleteMiniappLogo(req: PortalRequest) {
    const merchantId = this.helpers.getMerchantId(req);
    const current = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { miniappLogoUrl: true },
    });
    this.helpers.assertSettingsUpdateAccess(req, current, {
      miniappLogoUrl: null,
    } as unknown as UpdateMerchantSettingsDto);
    const previousAssetId = this.helpers.extractMiniappLogoAssetId(
      current?.miniappLogoUrl ?? null,
    );
    if (previousAssetId) {
      await this.prisma.communicationAsset.deleteMany({
        where: {
          id: previousAssetId,
          merchantId,
          kind: 'MINIAPP_LOGO',
        },
      });
    }
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { miniappLogoUrl: null, updatedAt: new Date() },
      create: { merchantId, miniappLogoUrl: null },
    });
    return { miniappLogoUrl: null };
  }
}
