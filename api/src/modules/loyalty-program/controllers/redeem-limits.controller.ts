import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PortalGuard } from '../../portal-auth/portal.guard';
import {
  assertPortalPermissions,
  PortalPermissionsHandled,
  type PortalPermissionState,
} from '../../portal-auth/portal-permissions.util';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { ensureRulesRoot } from '../../../shared/rules-json.util';

type PortalRequest = {
  portalMerchantId?: string;
  portalPermissions?: PortalPermissionState | null;
};

const MAX_TTL_DAYS = 3650;
const MAX_DELAY_DAYS = 3650;

@UseGuards(PortalGuard)
@Controller('portal/loyalty/redeem-limits')
export class RedeemLimitsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private merchantId(req: PortalRequest) {
    return String(req.portalMerchantId);
  }

  @Get()
  @PortalPermissionsHandled()
  async getSettings(@Req() req: PortalRequest) {
    assertPortalPermissions(
      req,
      ['mechanic_redeem_limits', 'mechanic_ttl'],
      'read',
      'any',
    );
    const merchantId = this.merchantId(req);
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules = ensureRulesRoot(s?.rulesJson);
    const allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
    const ttlDays = Number(s?.pointsTtlDays ?? 0) || 0;
    const delayDays = Number(s?.earnDelayDays ?? 0) || 0;
    return {
      ttlEnabled: ttlDays > 0,
      ttlDays,
      allowSameReceipt: allowSame,
      delayEnabled: delayDays > 0,
      delayDays,
    };
  }

  @Put()
  @PortalPermissionsHandled()
  async updateSettings(
    @Req() req: PortalRequest,
    @Body()
    body: {
      ttlEnabled?: boolean;
      ttlDays?: number;
      allowSameReceipt?: boolean;
      delayEnabled?: boolean;
      delayDays?: number;
    },
  ) {
    const merchantId = this.merchantId(req);
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules = ensureRulesRoot(s?.rulesJson);
    const currentAllowSame = Boolean(rules.allowEarnRedeemSameReceipt);
    const currentTtlDays = Number(s?.pointsTtlDays ?? 0) || 0;
    const currentDelayDays = Number(s?.earnDelayDays ?? 0) || 0;

    const hasTtlEnabled = Object.hasOwn(body, 'ttlEnabled');
    const hasTtlDays = Object.hasOwn(body, 'ttlDays');
    let pointsTtlDays = currentTtlDays;
    if (hasTtlEnabled || hasTtlDays) {
      const ttlEnabled = hasTtlEnabled
        ? Boolean(body?.ttlEnabled)
        : currentTtlDays > 0;
      const ttlDaysRaw = Number(hasTtlDays ? body?.ttlDays : currentTtlDays);
      pointsTtlDays = ttlEnabled
        ? Math.min(
            MAX_TTL_DAYS,
            Math.max(1, Math.floor(Number(ttlDaysRaw) || 0)),
          )
        : 0;
    }

    const hasDelayEnabled = Object.hasOwn(body, 'delayEnabled');
    const hasDelayDays = Object.hasOwn(body, 'delayDays');
    const delayRequested = hasDelayEnabled || hasDelayDays;
    let earnDelayDays = currentDelayDays;
    if (delayRequested) {
      const delayEnabled = hasDelayEnabled
        ? Boolean(body?.delayEnabled)
        : currentDelayDays > 0;
      const delayDaysRaw = Number(
        hasDelayDays ? body?.delayDays : currentDelayDays,
      );
      earnDelayDays = delayEnabled
        ? Math.min(
            MAX_DELAY_DAYS,
            Math.max(1, Math.floor(Number(delayDaysRaw) || 0)),
          )
        : 0;
    }

    let allowSame = false;
    if (
      body &&
      Object.prototype.hasOwnProperty.call(body, 'allowSameReceipt')
    ) {
      allowSame = Boolean(body.allowSameReceipt);
    } else {
      // если ничего не передано — оставляем как было
      if (Object.hasOwn(rules, 'allowEarnRedeemSameReceipt')) {
        allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
      }
    }

    if (
      delayRequested &&
      earnDelayDays > 0 &&
      !this.config.isEarnLotsEnabled()
    ) {
      throw new BadRequestException(
        'Отложенное начисление недоступно без поддержки лотов',
      );
    }
    if (pointsTtlDays > 0 && !this.config.isEarnLotsEnabled()) {
      throw new BadRequestException(
        'Сгорание баллов недоступно без поддержки лотов',
      );
    }

    const ttlChanged = pointsTtlDays !== currentTtlDays;
    const delayChanged = earnDelayDays !== currentDelayDays;
    const allowSameChanged = allowSame !== currentAllowSame;
    if (ttlChanged) {
      assertPortalPermissions(req, ['mechanic_ttl'], 'manage');
    }
    if (delayChanged || allowSameChanged) {
      assertPortalPermissions(req, ['mechanic_redeem_limits'], 'manage');
    }
    if (!ttlChanged && !delayChanged && !allowSameChanged) {
      assertPortalPermissions(
        req,
        ['mechanic_redeem_limits', 'mechanic_ttl'],
        'read',
        'any',
      );
    }

    // Обновляем rulesJson: используем allowEarnRedeemSameReceipt
    delete rules['disallowEarnRedeemSameReceipt'];
    rules['allowEarnRedeemSameReceipt'] = allowSame;

    const rulesJson = rules as Prisma.InputJsonValue;
    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { pointsTtlDays, earnDelayDays, rulesJson },
      create: { merchantId, pointsTtlDays, earnDelayDays, rulesJson },
    });

    const updTtlDays = Number(updated.pointsTtlDays ?? 0) || 0;
    const updDelayDays = Number(updated.earnDelayDays ?? 0) || 0;
    return {
      ok: true,
      ttlEnabled: updTtlDays > 0,
      ttlDays: updTtlDays,
      allowSameReceipt: allowSame,
      delayEnabled: updDelayDays > 0,
      delayDays: updDelayDays,
    };
  }
}
