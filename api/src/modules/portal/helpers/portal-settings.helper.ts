import { Injectable } from '@nestjs/common';
import {
  assertPortalPermissions,
  hasPortalPermission,
} from '../../portal-auth/portal-permissions.util';
import { getRulesRoot } from '../../../shared/rules-json.util';
import type { UpdateMerchantSettingsDto } from '../../merchants/dto';
import type { ReferralProgramSettingsDto } from '../../referral/referral.service';
import type { PortalRequest } from '../portal.types';
import { asRecord } from '../../../shared/common/input.util';

@Injectable()
export class PortalSettingsHelper {
  buildMiniappLogoPath(merchantId: string, assetId: string) {
    return `/loyalty/miniapp-logo/${merchantId}/${assetId}`;
  }

  extractMiniappLogoAssetId(value?: string | null): string | null {
    if (!value) return null;
    const match = value.match(/\/loyalty\/miniapp-logo\/[^/]+\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  normalizeReferralProgramPayload(body: unknown): ReferralProgramSettingsDto {
    const data = asRecord(body) ?? {};
    const rewardTrigger: ReferralProgramSettingsDto['rewardTrigger'] =
      data.rewardTrigger === 'all' ? 'all' : 'first';
    const rewardType: ReferralProgramSettingsDto['rewardType'] =
      data.rewardType === 'PERCENT' || data.rewardType === 'percent'
        ? 'percent'
        : 'fixed';
    const rewardValueRaw = Number(data.rewardValue ?? 0);
    const friendRewardRaw = Number(data.friendReward ?? 0);
    const minPurchaseRaw = Number(data.minPurchaseAmount ?? 0);
    const placeholders = Array.isArray(data.placeholders)
      ? data.placeholders
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item: string) => item.length > 0)
      : undefined;
    const levels = Array.isArray(data.levels)
      ? data.levels.map((item) => {
          const level = asRecord(item) ?? {};
          return {
            level: Number(level.level ?? 0),
            enabled: Boolean(level.enabled),
            reward: Number(level.reward ?? 0),
          };
        })
      : [];

    return {
      enabled: Boolean(data.enabled),
      rewardTrigger,
      rewardType,
      multiLevel: Boolean(data.multiLevel),
      rewardValue: Number.isFinite(rewardValueRaw) ? rewardValueRaw : 0,
      levels,
      friendReward: Number.isFinite(friendRewardRaw) ? friendRewardRaw : 0,
      stackWithRegistration: Boolean(data.stackWithRegistration),
      message: typeof data.message === 'string' ? data.message : '',
      placeholders,
      shareMessage:
        typeof data.shareMessage === 'string' ? data.shareMessage : undefined,
      minPurchaseAmount:
        Number.isFinite(minPurchaseRaw) && minPurchaseRaw > 0
          ? Math.round(minPurchaseRaw)
          : 0,
    };
  }

  assertSettingsReadAccess(req: PortalRequest) {
    assertPortalPermissions(
      req,
      [
        'system_settings',
        'mechanic_birthday',
        'mechanic_auto_return',
        'mechanic_registration_bonus',
        'mechanic_redeem_limits',
        'mechanic_ttl',
        'antifraud',
        'integrations',
        'feedback',
      ],
      'read',
      'any',
    );
  }

  maskSettingsSecrets(
    _req: PortalRequest,
    settings: Record<string, unknown> | null,
  ) {
    if (!settings) return settings;
    return {
      ...settings,
      webhookSecret: null,
      webhookSecretNext: null,
      telegramBotToken: null,
    };
  }

  filterSettingsByPermissions(
    req: PortalRequest,
    settings: Record<string, unknown> | null,
  ) {
    if (!settings) return settings;
    if (req.portalActor !== 'STAFF') return settings;
    if (hasPortalPermission(req.portalPermissions, 'system_settings', 'read')) {
      return settings;
    }

    const filtered: Record<string, unknown> = {
      merchantId: settings.merchantId,
    };
    const rulesJson = getRulesRoot(settings.rulesJson);
    const nextRules: Record<string, unknown> = {};
    const pickRule = (key: string, allowed: boolean) => {
      if (!allowed || !rulesJson) return;
      if (Object.prototype.hasOwnProperty.call(rulesJson, key)) {
        nextRules[key] = rulesJson[key];
      }
    };

    const allowTtl = hasPortalPermission(
      req.portalPermissions,
      'mechanic_ttl',
      'read',
    );
    if (allowTtl) {
      filtered.pointsTtlDays = settings.pointsTtlDays ?? null;
      pickRule('burnReminder', true);
    }

    const allowRedeemLimits = hasPortalPermission(
      req.portalPermissions,
      'mechanic_redeem_limits',
      'read',
    );
    if (allowRedeemLimits) {
      filtered.earnDelayDays = settings.earnDelayDays ?? null;
      pickRule('allowEarnRedeemSameReceipt', true);
      pickRule('disallowEarnRedeemSameReceipt', true);
    }

    pickRule(
      'birthday',
      hasPortalPermission(req.portalPermissions, 'mechanic_birthday', 'read'),
    );
    pickRule(
      'autoReturn',
      hasPortalPermission(
        req.portalPermissions,
        'mechanic_auto_return',
        'read',
      ),
    );
    pickRule(
      'registration',
      hasPortalPermission(
        req.portalPermissions,
        'mechanic_registration_bonus',
        'read',
      ),
    );
    pickRule(
      'af',
      hasPortalPermission(req.portalPermissions, 'antifraud', 'read'),
    );
    pickRule(
      'reviews',
      hasPortalPermission(req.portalPermissions, 'feedback', 'read'),
    );
    pickRule(
      'reviewsShare',
      hasPortalPermission(req.portalPermissions, 'feedback', 'read'),
    );
    pickRule(
      'levelsPeriodDays',
      hasPortalPermission(req.portalPermissions, 'mechanic_levels', 'read'),
    );

    if (Object.keys(nextRules).length) {
      filtered.rulesJson = nextRules;
    }

    if (hasPortalPermission(req.portalPermissions, 'integrations', 'read')) {
      filtered.telegramBotUsername = settings.telegramBotUsername ?? null;
      filtered.telegramStartParamRequired =
        settings.telegramStartParamRequired ?? null;
      filtered.miniappBaseUrl = settings.miniappBaseUrl ?? null;
      filtered.miniappThemePrimary = settings.miniappThemePrimary ?? null;
      filtered.miniappThemeBg = settings.miniappThemeBg ?? null;
      filtered.miniappLogoUrl = settings.miniappLogoUrl ?? null;
    }

    return filtered;
  }

  resolveSettingsUpdateResources(
    current: Record<string, unknown> | null,
    dto: UpdateMerchantSettingsDto,
  ) {
    const required = new Set<string>();
    const currentSettings = asRecord(current) ?? {};
    const setSystemIfDifferent = (next: unknown, currentValue: unknown) => {
      if (next === undefined) return;
      if (this.stableStringify(next) !== this.stableStringify(currentValue)) {
        required.add('system_settings');
      }
    };

    if (
      dto.earnBps !== undefined &&
      Number(dto.earnBps) !== Number(currentSettings.earnBps ?? 0)
    ) {
      required.add('system_settings');
    }
    if (
      dto.redeemLimitBps !== undefined &&
      Number(dto.redeemLimitBps) !== Number(currentSettings.redeemLimitBps ?? 0)
    ) {
      required.add('system_settings');
    }

    setSystemIfDifferent(dto.qrTtlSec, currentSettings.qrTtlSec);
    setSystemIfDifferent(dto.webhookUrl, currentSettings.webhookUrl);
    setSystemIfDifferent(dto.webhookSecret, currentSettings.webhookSecret);
    setSystemIfDifferent(dto.webhookKeyId, currentSettings.webhookKeyId);
    setSystemIfDifferent(
      dto.webhookSecretNext,
      currentSettings.webhookSecretNext,
    );
    setSystemIfDifferent(
      dto.webhookKeyIdNext,
      currentSettings.webhookKeyIdNext,
    );
    setSystemIfDifferent(dto.useWebhookNext, currentSettings.useWebhookNext);
    setSystemIfDifferent(
      dto.redeemCooldownSec,
      currentSettings.redeemCooldownSec,
    );
    setSystemIfDifferent(dto.earnCooldownSec, currentSettings.earnCooldownSec);
    setSystemIfDifferent(dto.redeemDailyCap, currentSettings.redeemDailyCap);
    setSystemIfDifferent(dto.earnDailyCap, currentSettings.earnDailyCap);
    setSystemIfDifferent(
      dto.requireJwtForQuote,
      currentSettings.requireJwtForQuote,
    );
    setSystemIfDifferent(
      dto.telegramBotToken,
      currentSettings.telegramBotToken,
    );
    setSystemIfDifferent(
      dto.telegramBotUsername,
      currentSettings.telegramBotUsername,
    );
    setSystemIfDifferent(
      dto.telegramStartParamRequired,
      currentSettings.telegramStartParamRequired,
    );
    setSystemIfDifferent(dto.miniappBaseUrl, currentSettings.miniappBaseUrl);
    setSystemIfDifferent(
      dto.miniappThemePrimary,
      currentSettings.miniappThemePrimary,
    );
    setSystemIfDifferent(dto.miniappThemeBg, currentSettings.miniappThemeBg);
    setSystemIfDifferent(dto.miniappLogoUrl, currentSettings.miniappLogoUrl);
    setSystemIfDifferent(dto.timezone, currentSettings.timezone);

    if (
      dto.pointsTtlDays !== undefined &&
      Number(dto.pointsTtlDays ?? 0) !==
        Number(currentSettings.pointsTtlDays ?? 0)
    ) {
      required.add('mechanic_ttl');
    }
    if (
      dto.earnDelayDays !== undefined &&
      Number(dto.earnDelayDays ?? 0) !==
        Number(currentSettings.earnDelayDays ?? 0)
    ) {
      required.add('mechanic_redeem_limits');
    }

    if (dto.rulesJson !== undefined) {
      const dtoRulesJson = dto.rulesJson as unknown;
      const currentRules =
        getRulesRoot(currentSettings.rulesJson) ??
        (Array.isArray(currentSettings.rulesJson) ? {} : null);
      const nextRules =
        getRulesRoot(dtoRulesJson) ?? (Array.isArray(dtoRulesJson) ? {} : null);
      if (!currentRules || !nextRules) {
        if (
          this.stableStringify(currentSettings.rulesJson) !==
          this.stableStringify(dto.rulesJson)
        ) {
          required.add('system_settings');
        }
      } else {
        const rulesKeys = new Set([
          ...Object.keys(currentRules),
          ...Object.keys(nextRules),
        ]);
        const rulesMap: Record<string, string> = {
          birthday: 'mechanic_birthday',
          autoReturn: 'mechanic_auto_return',
          registration: 'mechanic_registration_bonus',
          burnReminder: 'mechanic_ttl',
          af: 'antifraud',
          reviews: 'feedback',
          reviewsShare: 'feedback',
          allowEarnRedeemSameReceipt: 'mechanic_redeem_limits',
          disallowEarnRedeemSameReceipt: 'mechanic_redeem_limits',
          levelsPeriodDays: 'mechanic_levels',
        };
        for (const key of rulesKeys) {
          const before = currentRules[key];
          const after = nextRules[key];
          if (this.stableStringify(before) === this.stableStringify(after)) {
            continue;
          }
          const resource = rulesMap[key];
          required.add(resource || 'system_settings');
        }
      }
    }

    return required;
  }

  assertSettingsUpdateAccess(
    req: PortalRequest,
    current: Record<string, unknown> | null,
    dto: UpdateMerchantSettingsDto,
  ) {
    if (req.portalActor !== 'STAFF' || req.portalPermissions?.allowAll) {
      return;
    }
    if (
      hasPortalPermission(req.portalPermissions, 'system_settings', 'manage')
    ) {
      return;
    }
    const required = this.resolveSettingsUpdateResources(current, dto);
    if (required.size === 0) {
      this.assertSettingsReadAccess(req);
      return;
    }
    for (const resource of required) {
      assertPortalPermissions(req, [resource], 'manage');
    }
  }

  private stableStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const record = asRecord(value) ?? {};
    const entries = Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`,
      );
    return `{${entries.join(',')}}`;
  }
}
