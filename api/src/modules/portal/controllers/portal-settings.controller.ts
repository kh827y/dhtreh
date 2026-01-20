import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Prisma, CommunicationChannel } from '@prisma/client';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  assertPortalPermissions,
  PortalPermissionsHandled,
} from '../../portal-auth/portal-permissions.util';
import {
  MerchantsService,
} from '../../merchants/merchants.service';
import {
  MerchantSettingsRespDto,
  UpdateMerchantSettingsDto,
  UpdateMerchantNameDto,
  UpdateTimezoneDto,
} from '../../merchants/dto';
import { StaffMotivationService, type UpdateStaffMotivationPayload } from '../services/staff-motivation.service';
import { ReferralService } from '../../referral/referral.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  DEFAULT_TIMEZONE_CODE,
  RUSSIA_TIMEZONES,
  serializeTimezone,
} from '../../../shared/timezone/russia-timezones';
import {
  ensureRulesRoot,
  getRulesRoot,
  getRulesSection,
  setRulesSection,
} from '../../../shared/rules-json.util';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type {
  PortalRequest,
  UploadedFile as UploadedFilePayload,
} from './portal.controller-helpers';
import { TransactionItemDto, ErrorDto } from '../../loyalty/dto/dto';
import { FileInterceptor } from '@nestjs/platform-express';

const MAX_MINIAPP_LOGO_BYTES = 512 * 1024;
const ALLOWED_MINIAPP_LOGO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalSettingsController {
  constructor(
    private readonly service: MerchantsService,
    private readonly prisma: PrismaService,
    private readonly staffMotivation: StaffMotivationService,
    private readonly referrals: ReferralService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // ===== Staff motivation =====
  @Get('staff-motivation')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        pointsForNewCustomer: { type: 'number' },
        pointsForExistingCustomer: { type: 'number' },
        leaderboardPeriod: { type: 'string' },
        customDays: { type: 'number', nullable: true },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  getStaffMotivation(@Req() req: PortalRequest) {
    return this.staffMotivation.getSettings(this.helpers.getMerchantId(req));
  }

  @Put('staff-motivation')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  updateStaffMotivation(
    @Req() req: PortalRequest,
    @Body() body: UpdateStaffMotivationPayload,
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

  @Get('referrals/program')
  referralProgramSettings(@Req() req: PortalRequest) {
    return this.referrals.getProgramSettingsForMerchant(
      this.helpers.getMerchantId(req),
    );
  }

  @Put('referrals/program')
  updateReferralProgramSettings(
    @Req() req: PortalRequest,
    @Body() body: unknown,
  ) {
    const payload = this.helpers.normalizeReferralProgramPayload(body);
    return this.referrals.updateProgramSettingsFromPortal(
      this.helpers.getMerchantId(req),
      payload,
    );
  }

  @Get('loyalty/ttl/forecast')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        daysBefore: { type: 'number' },
      },
    },
  })
  async ttlReminderForecast(
    @Req() req: PortalRequest,
    @Query('daysBefore') daysBeforeStr?: string,
  ) {
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

  // Settings
  @Get('settings')
  @PortalPermissionsHandled()
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  getSettings(@Req() req: PortalRequest) {
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

  @Put('settings')
  @PortalPermissionsHandled()
  @ApiOkResponse({ type: MerchantSettingsRespDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateSettings(
    @Req() req: PortalRequest,
    @Body() dto: UpdateMerchantSettingsDto,
  ) {
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

  @Get('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  async getMerchantName(@Req() req: PortalRequest) {
    return this.service.getMerchantName(this.helpers.getMerchantId(req));
  }

  @Put('settings/name')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        name: { type: 'string' },
        initialName: { type: 'string' },
      },
    },
  })
  @ApiBadRequestResponse({ type: ErrorDto })
  async updateMerchantName(
    @Req() req: PortalRequest,
    @Body() dto: UpdateMerchantNameDto,
  ) {
    const payload = await this.service.updateMerchantName(
      this.helpers.getMerchantId(req),
      dto.name,
    );
    return { ok: true, ...payload };
  }

  @Get('settings/timezone')
  async getTimezoneSetting(@Req() req: PortalRequest) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezone = await this.service.getTimezone(merchantId);
    return {
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
  }

  @Put('settings/timezone')
  async updateTimezoneSetting(
    @Req() req: PortalRequest,
    @Body() dto: UpdateTimezoneDto,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const timezone = await this.service.updateTimezone(merchantId, dto.code);
    return {
      ok: true,
      timezone,
      options: RUSSIA_TIMEZONES.map((tz) => serializeTimezone(tz.code)),
    };
  }

  @Get('settings/support')
  async getSupportSetting(@Req() req: PortalRequest) {
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

  @Put('settings/support')
  async updateSupportSetting(@Req() req: PortalRequest, @Body() body: unknown) {
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

  @Get('settings/logo')
  @PortalPermissionsHandled()
  async getMiniappLogo(@Req() req: PortalRequest) {
    assertPortalPermissions(req, ['system_settings'], 'read');
    const merchantId = this.helpers.getMerchantId(req);
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { miniappLogoUrl: true },
    });
    return { miniappLogoUrl: settings?.miniappLogoUrl ?? null };
  }

  @Post('settings/logo')
  @PortalPermissionsHandled()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_MINIAPP_LOGO_BYTES } }),
  )
  async uploadMiniappLogo(
    @Req() req: PortalRequest,
    @UploadedFile() file: UploadedFilePayload,
  ) {
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

  @Delete('settings/logo')
  @PortalPermissionsHandled()
  async deleteMiniappLogo(@Req() req: PortalRequest) {
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
