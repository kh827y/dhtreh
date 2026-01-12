import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

const DEFAULTS = {
  dailyCap: 5,
  monthlyCap: 40,
  maxPoints: 3000,
  blockDaily: false,
};

async function fetchSettings(req: NextRequest) {
  const res = await portalFetch(req, '/portal/settings', { method: 'GET' });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {}
  return { res, data, raw };
}

function coercePositiveInt(value: any, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num <= 0) return 0;
  return Math.floor(num);
}

export async function GET(req: NextRequest) {
  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  const rules =
    data?.rulesJson &&
    typeof data.rulesJson === 'object' &&
    !Array.isArray(data.rulesJson)
      ? data.rulesJson
      : {};
  const antifraud = rules && typeof rules === 'object' && rules.af && typeof rules.af === 'object' ? rules.af : {};
  const customer = antifraud.customer && typeof antifraud.customer === 'object' ? antifraud.customer : {};

  const dailyCapRaw = Number(customer.dailyCap);
  const monthlyCapRaw = Number(customer.monthlyCap);
  const pointsCapRaw = Number(customer.pointsCap ?? customer.pointsCapPerOperation ?? customer.maxPointsPerOperation);

  const dailyCap = Number.isFinite(dailyCapRaw) && dailyCapRaw > 0 ? Math.floor(dailyCapRaw) : DEFAULTS.dailyCap;
  const monthlyCap = Number.isFinite(monthlyCapRaw) && monthlyCapRaw > 0 ? Math.floor(monthlyCapRaw) : DEFAULTS.monthlyCap;
  const maxPoints = Number.isFinite(pointsCapRaw) && pointsCapRaw > 0 ? Math.floor(pointsCapRaw) : DEFAULTS.maxPoints;
  const blockDaily = customer.blockDaily === undefined ? DEFAULTS.blockDaily : Boolean(customer.blockDaily);

  return Response.json({ dailyCap, monthlyCap, maxPoints, blockDaily });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({ error: 'BadRequest', message: 'Invalid payload' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  const dailyCap = coercePositiveInt(body.dailyCap, DEFAULTS.dailyCap);
  const monthlyCap = coercePositiveInt(body.monthlyCap, DEFAULTS.monthlyCap);
  const maxPoints = coercePositiveInt(body.maxPoints, DEFAULTS.maxPoints);
  const blockDaily = body.blockDaily === undefined ? DEFAULTS.blockDaily : Boolean(body.blockDaily);

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  }

  const rules: Record<string, any> =
    data?.rulesJson &&
    typeof data.rulesJson === 'object' &&
    !Array.isArray(data.rulesJson)
      ? { ...data.rulesJson }
      : {};
  const antifraud: Record<string, any> =
    rules.af && typeof rules.af === 'object' && !Array.isArray(rules.af)
      ? { ...rules.af }
      : {};
  const customer: Record<string, any> =
    antifraud.customer && typeof antifraud.customer === 'object' && !Array.isArray(antifraud.customer)
      ? { ...antifraud.customer }
      : {};

  customer.dailyCap = dailyCap;
  customer.monthlyCap = monthlyCap;
  customer.pointsCap = maxPoints;
  customer.blockDaily = blockDaily;

  antifraud.customer = customer;
  rules.af = antifraud;

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
  if (!update.ok) {
    return new Response(updateText, {
      status: update.status,
      headers: {
        'Content-Type': update.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  return Response.json({
    ok: true,
    dailyCap,
    monthlyCap,
    maxPoints,
    blockDaily,
  });
}
