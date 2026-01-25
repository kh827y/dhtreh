import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants.service';
import { UpdateMerchantSettingsDto } from '../dto';

type MerchantSettings = Awaited<ReturnType<MerchantsService['getSettings']>>;
type MerchantSettingsUpdateResult = Awaited<
  ReturnType<MerchantsService['updateSettings']>
>;
type MaskableSettings = MerchantSettings | MerchantSettingsUpdateResult;

@Injectable()
export class MerchantsSettingsUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  getSettings(merchantId: string) {
    return this.merchants
      .getSettings(merchantId)
      .then((settings) => this.maskSettingsSecrets(settings));
  }

  updateSettings(merchantId: string, dto: UpdateMerchantSettingsDto) {
    return this.merchants
      .updateSettings(
        merchantId,
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
        dto, // дополнительные поля (next секреты/флажок) без ломки сигнатуры
      )
      .then((settings) => this.maskSettingsSecrets(settings));
  }

  previewRules(
    merchantId: string,
    channel: 'VIRTUAL' | 'PC_POS' | 'SMART',
    weekdayStr?: string,
    category?: string,
  ) {
    const weekday = Math.max(
      0,
      Math.min(6, parseInt(weekdayStr || '0', 10) || 0),
    );
    const ch =
      channel === 'SMART' || channel === 'PC_POS' || channel === 'VIRTUAL'
        ? channel
        : 'VIRTUAL';
    return this.merchants.previewRules(merchantId, {
      channel: ch,
      weekday,
      category,
    });
  }

  resetAntifraudLimit(
    merchantId: string,
    body: {
      scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';
      targetId?: string;
    },
  ) {
    return this.merchants.resetAntifraudLimit(merchantId, body);
  }

  private maskSettingsSecrets(settings: MaskableSettings | null) {
    if (!settings) return settings;
    return {
      ...settings,
      webhookSecret: null,
      webhookSecretNext: null,
      telegramBotToken: null,
    };
  }
}
