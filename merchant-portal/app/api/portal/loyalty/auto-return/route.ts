import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

async function fetchSettings(req: NextRequest) {
  const res = await portalFetch(req, '/portal/settings', { method: 'GET' });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, raw: text };
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
  const autoReturn = rules && typeof rules === 'object' && rules.autoReturn && typeof rules.autoReturn === 'object'
    ? rules.autoReturn
    : {};

  const days = Math.max(1, Math.floor(Number(autoReturn?.days ?? autoReturn?.thresholdDays ?? 45) || 45));
  const text = typeof autoReturn?.text === 'string'
    ? autoReturn.text
    : 'Мы скучаем! Возвращайтесь и получите бонусные баллы.';
  const giftPoints = Math.max(0, Math.floor(Number(autoReturn?.giftPoints ?? 0) || 0));
  const giftTtlDays = Math.max(0, Math.floor(Number(autoReturn?.giftTtlDays ?? 0) || 0));
  const repeatDays = Math.max(0, Math.floor(Number(autoReturn?.repeat?.days ?? autoReturn?.repeatAfterDays ?? 0) || 0));

  return Response.json({
    enabled: Boolean(autoReturn?.enabled ?? false),
    days,
    text,
    giftEnabled: giftPoints > 0,
    giftPoints,
    giftBurnEnabled: giftTtlDays > 0,
    giftTtlDays,
    repeatEnabled: Boolean(autoReturn?.repeat?.enabled ?? (autoReturn?.repeatDays ? true : false)),
    repeatDays,
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

  const enabled = Boolean(body.enabled);
  const daysInput = Number(body.days);
  const days = Math.max(1, Math.floor(Number.isFinite(daysInput) ? daysInput : 0));
  if (enabled && days <= 0) {
    return new Response(JSON.stringify({ error: 'ValidationError', message: 'Количество дней должно быть положительным' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const textValue = typeof body.text === 'string' ? body.text.trim() : '';
  if (enabled && !textValue) {
    return new Response(JSON.stringify({ error: 'ValidationError', message: 'Укажите текст сообщения' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const giftEnabled = Boolean(body.giftEnabled);
  const giftPointsInput = Number(body.giftPoints);
  const giftPoints = giftEnabled ? Math.max(1, Math.floor(Number.isFinite(giftPointsInput) ? giftPointsInput : 0)) : 0;
  if (giftEnabled && giftPoints <= 0) {
    return new Response(JSON.stringify({ error: 'ValidationError', message: 'Количество подарочных баллов должно быть положительным' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const giftBurnEnabled = Boolean(body.giftBurnEnabled);
  const giftTtlDaysInput = Number(body.giftTtlDays);
  const giftTtlDays = giftBurnEnabled ? Math.max(1, Math.floor(Number.isFinite(giftTtlDaysInput) ? giftTtlDaysInput : 0)) : 0;
  if (giftBurnEnabled && giftTtlDays <= 0) {
    return new Response(JSON.stringify({ error: 'ValidationError', message: 'Срок сгорания подарочных баллов должен быть положительным' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const repeatEnabled = Boolean(body.repeatEnabled);
  const repeatDaysInput = Number(body.repeatDays);
  const repeatDays = repeatEnabled ? Math.max(1, Math.floor(Number.isFinite(repeatDaysInput) ? repeatDaysInput : 0)) : 0;
  if (repeatEnabled && repeatDays <= 0) {
    return new Response(JSON.stringify({ error: 'ValidationError', message: 'Интервал повтора должен быть положительным' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? { ...data.rulesJson } : {};
  const nextAutoReturn: Record<string, any> = {
    enabled,
    days,
    text: textValue,
  };
  if (giftEnabled) {
    nextAutoReturn.giftPoints = giftPoints;
    if (giftBurnEnabled) {
      nextAutoReturn.giftTtlDays = giftTtlDays;
    } else if (nextAutoReturn.giftTtlDays) {
      delete nextAutoReturn.giftTtlDays;
    }
  } else {
    nextAutoReturn.giftPoints = 0;
    if (nextAutoReturn.giftTtlDays) {
      delete nextAutoReturn.giftTtlDays;
    }
  }

  if (repeatEnabled) {
    nextAutoReturn.repeat = { enabled: true, days: repeatDays };
  } else if (rules?.autoReturn?.repeat) {
    nextAutoReturn.repeat = { enabled: false };
  }

  rules.autoReturn = nextAutoReturn;

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
