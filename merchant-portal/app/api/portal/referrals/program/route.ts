import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

type RawReferralRule = {
  enabled?: boolean;
  rewardTrigger?: 'first' | 'all';
  rewardType?: 'fixed' | 'percent';
  multiLevel?: boolean;
  rewardValue?: number;
  levels?: Array<{ level: number; enabled?: boolean; reward?: number }>;
  friendReward?: number;
  stackWithRegistration?: boolean;
  message?: string;
};

type ReferralSettings = {
  enabled: boolean;
  rewardTrigger: 'first' | 'all';
  rewardType: 'fixed' | 'percent';
  multiLevel: boolean;
  rewardValue: number;
  levels: Array<{ level: number; enabled: boolean; reward: number }>;
  friendReward: number;
  stackWithRegistration: boolean;
  message: string;
};

const PLACEHOLDERS = ['{businessname}', '{bonusamount}', '{code}', '{link}'];

async function fetchSettings(req: NextRequest) {
  const res = await portalFetch(req, '/portal/settings', { method: 'GET' });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { res, data, raw };
}

function normalizeNumber(value: unknown, fallback = 0, options?: { min?: number; max?: number }) {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN;
  const min = options?.min ?? 0;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(Math.max(parsed, min), max);
  return Math.round(clamped * 100) / 100;
}

function normalizeMessage(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const normalized = trimmed.slice(0, 300);
  if (!normalized) return '';
  return normalized;
}

function normalizeReferralRule(rule: RawReferralRule | null | undefined): ReferralSettings {
  const enabled = Boolean(rule?.enabled);
  const rewardTrigger = rule?.rewardTrigger === 'all' ? 'all' : 'first';
  const rewardType = rule?.rewardType === 'percent' ? 'percent' : 'fixed';
  const multiLevel = Boolean(rule?.multiLevel);
  const friendReward = normalizeNumber(rule?.friendReward, 0, { min: 0 });
  const stackWithRegistration = Boolean(rule?.stackWithRegistration);
  const message = normalizeMessage(rule?.message) ||
    'Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или промокодом {code}.';

  const rawLevels = Array.isArray(rule?.levels) ? rule!.levels : [];
  const levels: Array<{ level: number; enabled: boolean; reward: number }> = [];
  for (let level = 1; level <= 5; level += 1) {
    const found = rawLevels.find((item) => item?.level === level);
    const mandatory = level <= 2;
    const enabledLevel = multiLevel ? (mandatory ? true : Boolean(found?.enabled)) : false;
    const reward = multiLevel
      ? normalizeNumber(found?.reward, level === 1 ? normalizeNumber(rule?.rewardValue, 0) : 0, {
          min: 0,
          max: rewardType === 'percent' ? 100 : Number.POSITIVE_INFINITY,
        })
      : 0;
    levels.push({ level, enabled: enabledLevel, reward });
  }

  const rewardValue = multiLevel
    ? normalizeNumber(rule?.rewardValue, 0, { min: 0 })
    : normalizeNumber(rule?.rewardValue, rewardType === 'percent' ? 10 : 300, {
        min: 0,
        max: rewardType === 'percent' ? 100 : Number.POSITIVE_INFINITY,
      });

  return {
    enabled,
    rewardTrigger,
    rewardType,
    multiLevel,
    rewardValue,
    levels,
    friendReward,
    stackWithRegistration,
    message,
  };
}

function serializeReferralRule(existing: any, next: ReferralSettings) {
  const rule: RawReferralRule = {
    enabled: next.enabled,
    rewardTrigger: next.rewardTrigger,
    rewardType: next.rewardType,
    multiLevel: next.multiLevel,
    friendReward: next.friendReward,
    stackWithRegistration: next.stackWithRegistration,
    message: next.message,
  };

  if (next.multiLevel) {
    rule.levels = next.levels.map((level) => ({
      level: level.level,
      enabled: level.level <= 2 ? true : level.enabled,
      reward: level.reward,
    }));
  } else {
    rule.rewardValue = next.rewardValue;
  }

  if (!Array.isArray(rule.levels)) delete (rule as any).levels;

  if (next.rewardType === 'percent') {
    rule.rewardValue = next.multiLevel ? undefined : Math.min(next.rewardValue, 100);
    if (rule.levels) {
      rule.levels = rule.levels.map((level) => ({
        ...level,
        reward: Math.min(level.reward, 100),
      }));
    }
  }

  const merged = { ...(existing || {}), referral: { ...(existing?.referral || {}), ...rule } };
  if (!next.multiLevel) delete (merged.referral as any).levels;
  if (next.multiLevel) delete (merged.referral as any).rewardValue;
  return merged;
}

export async function GET(req: NextRequest) {
  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? (data.rulesJson as Record<string, any>) : {};
  const referral = normalizeReferralRule(rules?.referral as RawReferralRule | undefined);

  return Response.json({ ...referral, placeholders: PLACEHOLDERS });
}

function parsePayload(body: any): ReferralSettings {
  if (!body || typeof body !== 'object') {
    throw new Error('Некорректный запрос');
  }

  const enabled = Boolean(body.enabled);
  const rewardTrigger: 'first' | 'all' = body.rewardTrigger === 'all' ? 'all' : 'first';
  const rewardType: 'fixed' | 'percent' = body.rewardType === 'percent' ? 'percent' : 'fixed';
  const multiLevel = Boolean(body.multiLevel);
  const stackWithRegistration = Boolean(body.stackWithRegistration);
  const message = normalizeMessage(body.message || '') || '';

  const friendRewardRaw = Number(String(body.friendReward ?? ''));
  if (!Number.isFinite(friendRewardRaw) || friendRewardRaw < 0) {
    throw new Error('Укажите корректное количество баллов для приглашённого друга');
  }
  const friendReward = Math.round(friendRewardRaw * 100) / 100;

  if (message.length > 300) {
    throw new Error('Текст сообщения не должен превышать 300 символов');
  }

  if (multiLevel) {
    const levelsInput = Array.isArray(body.levels) ? body.levels : [];
    const levels: ReferralSettings['levels'] = [];
    for (let level = 1; level <= 5; level += 1) {
      const found = levelsInput.find((item: any) => Number(item?.level) === level) || {};
      const mandatory = level <= 2;
      const enabledLevel = mandatory ? true : Boolean(found.enabled);
      const rawValue = Number(String(found.reward ?? ''));
      if (!Number.isFinite(rawValue) || rawValue < 0) {
        throw new Error(`Укажите корректное значение награды для уровня ${level}`);
      }
      if (rewardType === 'percent' && rawValue > 100) {
        throw new Error(`Процент награды для уровня ${level} не может превышать 100%`);
      }
      if (enabled && enabledLevel && rawValue <= 0) {
        throw new Error(`Награда для уровня ${level} должна быть больше 0`);
      }
      levels.push({ level, enabled: enabledLevel, reward: Math.round(rawValue * 100) / 100 });
    }
    return {
      enabled,
      rewardTrigger,
      rewardType,
      multiLevel,
      rewardValue: 0,
      levels,
      friendReward,
      stackWithRegistration,
      message,
    };
  }

  const rewardValueRaw = Number(String(body.rewardValue ?? ''));
  if (!Number.isFinite(rewardValueRaw) || rewardValueRaw < 0) {
    throw new Error('Укажите корректный размер поощрения');
  }
  if (enabled && rewardValueRaw <= 0) {
    throw new Error('Размер поощрения должен быть больше 0');
  }
  if (rewardType === 'percent' && rewardValueRaw > 100) {
    throw new Error('Процент поощрения не может превышать 100%');
  }

  return {
    enabled,
    rewardTrigger,
    rewardType,
    multiLevel,
    rewardValue: Math.round(rewardValueRaw * 100) / 100,
    levels: [],
    friendReward,
    stackWithRegistration,
    message,
  };
}

export async function PUT(req: NextRequest) {
  let payload: ReferralSettings;
  try {
    const body = await req.json();
    payload = parsePayload(body);
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'ValidationError', message: String(error?.message || error || 'Некорректный запрос') }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? { ...data.rulesJson } : {};
  const nextRules = serializeReferralRule(rules, payload);

  const body = {
    earnBps: data?.earnBps ?? 0,
    redeemLimitBps: data?.redeemLimitBps ?? 0,
    qrTtlSec: data?.qrTtlSec ?? undefined,
    webhookUrl: data?.webhookUrl ?? undefined,
    webhookSecret: data?.webhookSecret ?? undefined,
    webhookKeyId: data?.webhookKeyId ?? undefined,
    webhookSecretNext: data?.webhookSecretNext ?? undefined,
    webhookKeyIdNext: data?.webhookKeyIdNext ?? undefined,
    useWebhookNext: data?.useWebhookNext ?? undefined,
    redeemCooldownSec: data?.redeemCooldownSec ?? undefined,
    earnCooldownSec: data?.earnCooldownSec ?? undefined,
    redeemDailyCap: data?.redeemDailyCap ?? undefined,
    earnDailyCap: data?.earnDailyCap ?? undefined,
    requireJwtForQuote: data?.requireJwtForQuote ?? undefined,
    rulesJson: nextRules,
    requireBridgeSig: data?.requireBridgeSig ?? undefined,
    bridgeSecret: data?.bridgeSecret ?? undefined,
    bridgeSecretNext: data?.bridgeSecretNext ?? undefined,
    requireStaffKey: data?.requireStaffKey ?? undefined,
    pointsTtlDays: data?.pointsTtlDays ?? undefined,
    earnDelayDays: data?.earnDelayDays ?? undefined,
    telegramBotToken: data?.telegramBotToken ?? undefined,
    telegramBotUsername: data?.telegramBotUsername ?? undefined,
    telegramStartParamRequired: data?.telegramStartParamRequired ?? undefined,
    miniappBaseUrl: data?.miniappBaseUrl ?? undefined,
    miniappThemePrimary: data?.miniappThemePrimary ?? undefined,
    miniappThemeBg: data?.miniappThemeBg ?? undefined,
    miniappLogoUrl: data?.miniappLogoUrl ?? undefined,
    phone: data?.phone ?? undefined,
    smsSignature: data?.smsSignature ?? undefined,
    monthlyReports: data?.monthlyReports ?? undefined,
    staffMotivationEnabled: data?.staffMotivationEnabled ?? undefined,
    staffMotivationNewCustomerPoints: data?.staffMotivationNewCustomerPoints ?? undefined,
    staffMotivationExistingCustomerPoints: data?.staffMotivationExistingCustomerPoints ?? undefined,
    staffMotivationLeaderboardPeriod: data?.staffMotivationLeaderboardPeriod ?? undefined,
    staffMotivationCustomDays: data?.staffMotivationCustomDays ?? undefined,
  };

  const update = await portalFetch(req, '/portal/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const updateText = await update.text();
  return new Response(updateText, {
    status: update.status,
    headers: { 'Content-Type': update.headers.get('content-type') ?? 'application/json' },
  });
}
