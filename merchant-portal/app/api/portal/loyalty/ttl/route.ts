import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

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

function parsePositiveInt(value: unknown, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

export async function GET(req: NextRequest) {
  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? data.rulesJson : {};
  const reminder =
    rules && typeof rules === 'object' && rules.burnReminder && typeof rules.burnReminder === 'object'
      ? rules.burnReminder
      : {};

  const enabled = Boolean(reminder?.enabled);
  const daysBefore = parsePositiveInt(reminder?.daysBefore ?? reminder?.days ?? reminder?.daysBeforeBurn, 5) || 5;
  const text =
    typeof reminder?.text === 'string'
      ? reminder.text
      : 'Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!';

  return Response.json({
    enabled,
    daysBefore,
    text,
    pointsTtlDays: Number(data?.pointsTtlDays ?? 0) || 0,
    telegramBotConnected: Boolean(data?.telegramBotToken),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const enabled = Boolean((body as any).enabled);
  const daysRaw = Number((body as any).daysBefore ?? (body as any).days);
  const daysBefore = Math.max(1, Math.floor(Number.isFinite(daysRaw) ? daysRaw : 0));
  const text = typeof (body as any).text === 'string' ? (body as any).text.trim() : '';

  if (enabled) {
    if (!text) {
      return new Response(JSON.stringify({ error: 'ValidationError', message: 'Введите текст уведомления' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (daysBefore <= 0) {
      return new Response(
        JSON.stringify({ error: 'ValidationError', message: 'Количество дней должно быть положительным' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  }

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? { ...data.rulesJson } : {};
  const currentReminder =
    rules && typeof rules === 'object' && rules.burnReminder && typeof rules.burnReminder === 'object'
      ? { ...rules.burnReminder }
      : {};

  const nextReminder: Record<string, any> = { ...currentReminder, enabled };
  if (enabled) {
    nextReminder.daysBefore = daysBefore;
    nextReminder.text = text;
  } else {
    nextReminder.enabled = false;
  }

  rules.burnReminder = nextReminder;

  const payload: Record<string, any> = {
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
    rulesJson: rules,
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
  };

  const update = await portalFetch(req, '/portal/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const updateText = await update.text();
  return new Response(updateText, {
    status: update.status,
    headers: { 'Content-Type': update.headers.get('content-type') ?? 'application/json' },
  });
}
