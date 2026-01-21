import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MerchantsSettingsService } from './merchants-settings.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { ensureBaseTier } from '../../loyalty/utils/tier-defaults.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { asRecord } from '../merchants.utils';
import { getRulesRoot } from '../../../shared/rules-json.util';

@Injectable()
export class MerchantsAntifraudService {
  private readonly logger = new Logger(MerchantsAntifraudService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MerchantsSettingsService,
    private readonly cache: LookupCacheService,
  ) {}

  async resetAntifraudLimit(
    merchantId: string,
    payload: {
      scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';
      targetId?: string;
    },
  ) {
    const scope = String(payload?.scope || '').trim() as
      | 'merchant'
      | 'customer'
      | 'staff'
      | 'device'
      | 'outlet';
    if (
      !['merchant', 'customer', 'staff', 'device', 'outlet'].includes(scope)
    ) {
      throw new BadRequestException('scope is invalid');
    }
    if (scope !== 'merchant' && !payload?.targetId) {
      throw new BadRequestException('targetId is required');
    }
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true },
    });
    const normalized = this.settings.normalizeRulesJson(
      settings?.rulesJson ?? null,
    );
    const normalizedRecord = asRecord(normalized);
    const rules: Record<string, unknown> = normalizedRecord
      ? { ...normalizedRecord }
      : {};
    const afRecord = asRecord(rules.af);
    const af: Record<string, unknown> = afRecord ? { ...afRecord } : {};
    const resetRecord = asRecord(af.reset);
    const reset: Record<string, unknown> = resetRecord
      ? { ...resetRecord }
      : {};
    const nowIso = new Date().toISOString();

    if (scope === 'merchant') {
      reset.merchant = nowIso;
    } else {
      const id = String(payload?.targetId || '').trim();
      const bucketRecord = asRecord(reset[scope]);
      const bucket: Record<string, unknown> = bucketRecord
        ? { ...bucketRecord }
        : {};
      bucket[id] = nowIso;
      reset[scope] = bucket;
    }

    af.reset = reset;
    rules.af = af;

    const rulesJson = rules as Prisma.InputJsonValue;
    await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: { rulesJson, updatedAt: new Date() },
      create: { merchantId, rulesJson },
    });
    this.cache.invalidateSettings(merchantId);

    return { ok: true };
  }

  async previewRules(
    merchantId: string,
    args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      category?: string;
    },
  ) {
    const s = await this.settings.getSettings(merchantId);
    let earnBps = 0;
    let redeemLimitBps = 0;
    try {
      await ensureBaseTier(this.prisma, merchantId);
      const tier = await this.prisma.loyaltyTier.findFirst({
        where: { merchantId, isInitial: true },
        orderBy: { thresholdAmount: 'asc' },
      });
      if (tier) {
        if (typeof tier.earnRateBps === 'number') {
          earnBps = Math.max(0, Math.floor(Number(tier.earnRateBps)));
        }
        if (typeof tier.redeemRateBps === 'number') {
          redeemLimitBps = Math.max(0, Math.floor(Number(tier.redeemRateBps)));
        }
      }
    } catch (err) {
      logIgnoredError(
        err,
        'MerchantsAntifraudService base tier',
        this.logger,
        'debug',
      );
    }
    const rulesRoot = getRulesRoot(s.rulesJson) ?? {};
    const rulesArray = Array.isArray(
      (rulesRoot as Record<string, unknown>).rules,
    )
      ? ((rulesRoot as Record<string, unknown>).rules as unknown[])
      : [];
    for (const item of rulesArray) {
      try {
        const rule = asRecord(item);
        if (!rule) continue;
        const cond = asRecord(rule.if);
        if (
          Array.isArray(cond?.channelIn) &&
          !cond.channelIn
            .filter((value): value is string => typeof value === 'string')
            .includes(args.channel)
        )
          continue;
        const then = asRecord(rule.then);
        if (then?.earnBps != null) earnBps = Number(then.earnBps);
        if (then?.redeemLimitBps != null)
          redeemLimitBps = Number(then.redeemLimitBps);
      } catch (err) {
        logIgnoredError(
          err,
          'MerchantsAntifraudService rules json',
          this.logger,
          'debug',
        );
      }
    }
    return { earnBps, redeemLimitBps };
  }
}
