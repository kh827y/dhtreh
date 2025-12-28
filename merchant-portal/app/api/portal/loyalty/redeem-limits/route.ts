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

export async function GET(req: NextRequest) {
  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } });
  }
  const ttlDays = Number(data?.pointsTtlDays ?? 0) || 0;
  const delayDays = Number(data?.earnDelayDays ?? 0) || 0;
  const rulesJson = data?.rulesJson && typeof data.rulesJson === 'object' ? data.rulesJson : {};
  const allowSameReceipt = Boolean((rulesJson as any).allowEarnRedeemSameReceipt);

  return Response.json({
    ttlEnabled: ttlDays > 0,
    ttlDays,
    delayEnabled: delayDays > 0,
    delayDays,
    allowSameReceipt,
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
  const ttlEnabled = Boolean(body.ttlEnabled);
  const ttlDaysInput = Number(body.ttlDays);
  const ttlDays = ttlEnabled ? Math.max(0, Math.floor(Number.isFinite(ttlDaysInput) ? ttlDaysInput : 0)) : 0;

  const delayEnabled = Boolean(body.delayEnabled);
  const delayDaysInput = Number(body.delayDays);
  const delayDays = delayEnabled ? Math.max(0, Math.floor(Number.isFinite(delayDaysInput) ? delayDaysInput : 0)) : 0;

  const allowSameReceipt = Boolean((body as any).allowSameReceipt);

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } });
  }

  const rulesJson = data?.rulesJson && typeof data.rulesJson === 'object' ? { ...data.rulesJson } : {};
  delete (rulesJson as any).disallowEarnRedeemSameReceipt;
  (rulesJson as any).allowEarnRedeemSameReceipt = allowSameReceipt;

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
    rulesJson,
    requireBridgeSig: data?.requireBridgeSig ?? undefined,
    bridgeSecret: data?.bridgeSecret ?? undefined,
    bridgeSecretNext: data?.bridgeSecretNext ?? undefined,
    requireStaffKey: data?.requireStaffKey ?? undefined,
    pointsTtlDays: ttlDays,
    earnDelayDays: delayDays,
  };

  const update = await portalFetch(req, '/portal/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const updateText = await update.text();
  return new Response(updateText, { status: update.status, headers: { 'Content-Type': update.headers.get('content-type') ?? 'application/json' } });
}
