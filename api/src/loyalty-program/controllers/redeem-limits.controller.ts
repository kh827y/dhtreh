import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { assertPortalPermissions } from '../../portal-auth/portal-permissions.util';
import { PrismaService } from '../../prisma.service';

function ensureObject(input: any): Record<string, any> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? { ...input }
    : {};
}

const MAX_TTL_DAYS = 3650;
const MAX_DELAY_DAYS = 3650;

@UseGuards(PortalGuard)
@Controller('portal/loyalty/redeem-limits')
export class RedeemLimitsController {
  constructor(private readonly prisma: PrismaService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async getSettings(@Req() req: any) {
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
    const rules = ensureObject(s?.rulesJson ?? null);
    const allowSame = Boolean((rules as any).allowEarnRedeemSameReceipt);
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
  async updateSettings(
    @Req() req: any,
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
    const rules = ensureObject(s?.rulesJson ?? null);
    const currentAllowSame = Boolean((rules as any).allowEarnRedeemSameReceipt);
    const currentTtlDays = Number(s?.pointsTtlDays ?? 0) || 0;
    const currentDelayDays = Number(s?.earnDelayDays ?? 0) || 0;

    const hasTtlEnabled = Object.prototype.hasOwnProperty.call(
      body,
      'ttlEnabled',
    );
    const hasTtlDays = Object.prototype.hasOwnProperty.call(body, 'ttlDays');
    let pointsTtlDays = currentTtlDays;
    if (hasTtlEnabled || hasTtlDays) {
      const ttlEnabled = hasTtlEnabled
        ? Boolean(body?.ttlEnabled)
        : currentTtlDays > 0;
      const ttlDaysRaw = Number(
        hasTtlDays ? body?.ttlDays : currentTtlDays,
      );
      pointsTtlDays = ttlEnabled
        ? Math.min(
            MAX_TTL_DAYS,
            Math.max(1, Math.floor(Number(ttlDaysRaw) || 0)),
          )
        : 0;
    }

    const hasDelayEnabled = Object.prototype.hasOwnProperty.call(
      body,
      'delayEnabled',
    );
    const hasDelayDays = Object.prototype.hasOwnProperty.call(
      body,
      'delayDays',
    );
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
    if (body && Object.prototype.hasOwnProperty.call(body, 'allowSameReceipt')) {
      allowSame = Boolean(body.allowSameReceipt);
    } else {
      // если ничего не передано — оставляем как было
      if (
        Object.prototype.hasOwnProperty.call(
          rules,
          'allowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
      }
    }

    if (
      delayRequested &&
      earnDelayDays > 0 &&
      process.env.EARN_LOTS_FEATURE !== '1'
    ) {
      throw new BadRequestException(
        'Отложенное начисление недоступно без поддержки лотов',
      );
    }
    if (pointsTtlDays > 0 && process.env.EARN_LOTS_FEATURE !== '1') {
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
    delete (rules as any).disallowEarnRedeemSameReceipt;
    (rules as any).allowEarnRedeemSameReceipt = allowSame;

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { pointsTtlDays, earnDelayDays, rulesJson: rules },
      create: { merchantId, pointsTtlDays, earnDelayDays, rulesJson: rules },
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
