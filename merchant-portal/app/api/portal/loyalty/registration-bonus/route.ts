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

function parseNonNegativeInt(value: unknown, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
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
  const registration =
    rules && typeof rules === 'object' && rules.registration && typeof rules.registration === 'object'
      ? rules.registration
      : {};

  const enabled = Boolean(registration?.enabled);
  const points = parsePositiveInt(registration?.points, 0);
  const ttlDays = parsePositiveInt(registration?.ttlDays ?? registration?.burnTtlDays, 0);
  const delayHours = parsePositiveInt(registration?.delayHours, 0);
  const delayDays = parsePositiveInt(registration?.delayDays ?? registration?.delayAfterDays, 0);
  const resolvedDelayHours = delayHours > 0 ? delayHours : delayDays > 0 ? delayDays * 24 : 0;

  let text: string | null = null;
  if (typeof registration?.text === 'string') {
    text = registration.text;
  }

  const pushEnabled =
    Object.prototype.hasOwnProperty.call(registration, 'pushEnabled')
      ? Boolean(registration.pushEnabled)
      : true;

  return Response.json({
    enabled,
    points,
    burnEnabled: ttlDays > 0,
    burnTtlDays: ttlDays,
    delayEnabled: resolvedDelayHours > 0,
    delayDays,
    delayHours: resolvedDelayHours,
    pushEnabled,
    text,
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
  const pointsRaw = Number((body as any).points);
  const points = Math.max(0, Math.floor(Number.isFinite(pointsRaw) ? pointsRaw : 0));
  if (enabled && points <= 0) {
    return new Response(
      JSON.stringify({ error: 'ValidationError', message: 'Укажите количество баллов за регистрацию' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const burnEnabled = Boolean((body as any).burnEnabled);
  const burnTtlRaw = Number((body as any).burnTtlDays);
  const burnTtlDays = burnEnabled ? Math.max(1, Math.floor(Number.isFinite(burnTtlRaw) ? burnTtlRaw : 0)) : 0;
  if (burnEnabled && burnTtlDays <= 0) {
    return new Response(
      JSON.stringify({ error: 'ValidationError', message: 'Срок сгорания должен быть положительным числом дней' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const delayEnabled = Boolean((body as any).delayEnabled);
  const delayHoursRaw = Number((body as any).delayHours);
  const delayDaysRaw = Number((body as any).delayDays);
  const delayHours = delayEnabled
    ? Math.max(1, Math.floor(Number.isFinite(delayHoursRaw) ? delayHoursRaw : 0))
    : 0;
  const delayDays = delayEnabled
    ? Math.max(1, Math.floor(Number.isFinite(delayDaysRaw) ? delayDaysRaw : parseNonNegativeInt(delayHours / 24, 0)))
    : 0;
  if (delayEnabled && delayHours <= 0 && delayDays <= 0) {
    return new Response(
      JSON.stringify({ error: 'ValidationError', message: 'Задержка начисления должна быть положительным числом часов' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const pushEnabled = Object.prototype.hasOwnProperty.call(body, 'pushEnabled')
    ? Boolean((body as any).pushEnabled)
    : true;
  const text = typeof (body as any).text === 'string' ? (body as any).text : null;

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules = data?.rulesJson && typeof data.rulesJson === 'object' ? { ...data.rulesJson } : {};
  const currentRegistration =
    rules && typeof rules === 'object' && rules.registration && typeof rules.registration === 'object'
      ? { ...rules.registration }
      : {};

  const nextRegistration: Record<string, any> = { ...currentRegistration, enabled, points };
  if (!enabled) {
    nextRegistration.enabled = false;
  }

  if (burnEnabled) {
    nextRegistration.ttlDays = burnTtlDays;
  } else {
    nextRegistration.ttlDays = 0;
  }

  if (delayEnabled) {
    nextRegistration.delayHours = delayHours;
    nextRegistration.delayDays = delayDays;
  } else {
    nextRegistration.delayHours = 0;
    nextRegistration.delayDays = 0;
  }

  nextRegistration.pushEnabled = pushEnabled;
  if (text && pushEnabled) {
    nextRegistration.text = text;
  } else if ('text' in nextRegistration) {
    delete nextRegistration.text;
  }

  rules.registration = nextRegistration;

  const payload: Record<string, any> = {
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
