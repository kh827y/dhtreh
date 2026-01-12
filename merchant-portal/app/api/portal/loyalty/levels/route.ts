import { NextRequest } from 'next/server';
import { portalFetch } from '../../_lib';

const DEFAULT_PERIOD_DAYS = 365;

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

function normalizePeriodDays(value: unknown, fallback = DEFAULT_PERIOD_DAYS) {
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

  const rules =
    data?.rulesJson && typeof data.rulesJson === 'object' && !Array.isArray(data.rulesJson)
      ? (data.rulesJson as Record<string, any>)
      : {};
  const periodDays = normalizePeriodDays(rules?.levelsPeriodDays, DEFAULT_PERIOD_DAYS);

  return Response.json({ periodDays });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'BadRequest', message: 'Invalid payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const periodRaw = Number((body as any).periodDays);
  if (!Number.isFinite(periodRaw) || periodRaw <= 0) {
    return new Response(
      JSON.stringify({ error: 'ValidationError', message: 'Количество дней должно быть положительным' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  const periodDays = Math.floor(periodRaw);

  const { res, data, raw } = await fetchSettings(req);
  if (!res.ok) {
    return new Response(raw, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  }

  const rules =
    data?.rulesJson && typeof data.rulesJson === 'object' && !Array.isArray(data.rulesJson)
      ? { ...data.rulesJson }
      : {};
  rules.levelsPeriodDays = periodDays;

  const update = await portalFetch(req, '/portal/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rulesJson: rules }),
  });
  const updateText = await update.text();
  return new Response(updateText, {
    status: update.status,
    headers: { 'Content-Type': update.headers.get('content-type') ?? 'application/json' },
  });
}
