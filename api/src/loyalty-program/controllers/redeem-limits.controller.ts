import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { PrismaService } from '../../prisma.service';

function ensureObject(input: any): Record<string, any> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? { ...input }
    : {};
}

@UseGuards(PortalGuard)
@Controller('portal/loyalty/redeem-limits')
export class RedeemLimitsController {
  constructor(private readonly prisma: PrismaService) {}

  private merchantId(req: any) {
    return String(req.portalMerchantId);
  }

  @Get()
  async getSettings(@Req() req: any) {
    const merchantId = this.merchantId(req);
    const s = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules = ensureObject(s?.rulesJson ?? null);
    // Новая семантика: allowEarnRedeemSameReceipt; поддержим обратную совместимость с legacy disallow
    let allowSame = false;
    if (
      Object.prototype.hasOwnProperty.call(rules, 'allowEarnRedeemSameReceipt')
    ) {
      allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
    } else if (
      Object.prototype.hasOwnProperty.call(
        rules,
        'disallowEarnRedeemSameReceipt',
      )
    ) {
      allowSame = !rules.disallowEarnRedeemSameReceipt;
    }
    const ttlDays = Number(s?.pointsTtlDays ?? 0) || 0;
    const delayDays = Number(s?.earnDelayDays ?? 0) || 0;
    return {
      ttlEnabled: ttlDays > 0,
      ttlDays,
      // Для обратной совместимости фронта, который может ожидать forbidSameReceipt
      forbidSameReceipt: !allowSame,
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
      forbidSameReceipt?: boolean;
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

    const ttlEnabled = Boolean(body?.ttlEnabled);
    const ttlDaysRaw = Number(body?.ttlDays ?? 0) || 0;
    const pointsTtlDays = ttlEnabled ? Math.max(1, Math.floor(ttlDaysRaw)) : 0;

    const delayEnabled = Boolean(body?.delayEnabled);
    const delayDaysRaw = Number(body?.delayDays ?? 0) || 0;
    const earnDelayDays = delayEnabled
      ? Math.max(1, Math.floor(delayDaysRaw))
      : 0;

    // Определяем allowSameReceipt из тела (приоритет у allowSameReceipt); поддержим forbidSameReceipt для обратной совместимости
    let allowSame = false;
    if (
      body &&
      Object.prototype.hasOwnProperty.call(body, 'allowSameReceipt')
    ) {
      allowSame = Boolean(body.allowSameReceipt);
    } else if (
      body &&
      Object.prototype.hasOwnProperty.call(body, 'forbidSameReceipt')
    ) {
      allowSame = !body.forbidSameReceipt;
    } else {
      // если ничего не передано — оставляем как было
      if (
        Object.prototype.hasOwnProperty.call(
          rules,
          'allowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = Boolean(rules.allowEarnRedeemSameReceipt);
      } else if (
        Object.prototype.hasOwnProperty.call(
          rules,
          'disallowEarnRedeemSameReceipt',
        )
      ) {
        allowSame = !rules.disallowEarnRedeemSameReceipt;
      }
    }

    // Обновляем rulesJson: используем новое поле allowEarnRedeemSameReceipt, legacy ключ удаляем
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
      forbidSameReceipt: !allowSame,
      delayEnabled: updDelayDays > 0,
      delayDays: updDelayDays,
    };
  }
}
