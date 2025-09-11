import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../_lib/session';
export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const METRICS_TOKEN = process.env.METRICS_TOKEN || '';

export async function GET(req: NextRequest) {
  if (!API_BASE) return new Response('API_BASE not configured', { status: 500 });
  {
    const auth = requireSession(req);
    if (auth) return auth;
  }
  try {
    const headers: any = {};
    if (METRICS_TOKEN) headers['X-Metrics-Token'] = METRICS_TOKEN;
    const res = await fetch(API_BASE + '/metrics', { headers });
    const text = await res.text();
    if (!res.ok) return new Response(text || 'metrics error', { status: 502 });
    const summary = parseMetrics(text);
    return NextResponse.json(summary);
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 500 });
  }
}

function parseMetrics(text: string) {
  const lines = text.split(/\r?\n/);
  let outboxPending = 0;
  let outboxDead = 0;
  let http5xx = 0;
  let http4xx = 0;
  let circuitOpen = 0;
  let rateLimited = 0;
  const counters: Record<string, number> = {};
  const outboxEventsByResult: Record<string, number> = {};
  const inc = (k: string, v: number) => { counters[k] = (counters[k] || 0) + v; };

  for (const ln of lines) {
    if (!ln || ln.startsWith('#')) continue;
    if (ln.startsWith('loyalty_outbox_pending ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!isNaN(v)) outboxPending = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_circuit_open ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!isNaN(v)) circuitOpen = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_rate_limited_total ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!isNaN(v)) rateLimited = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_dead_total ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!isNaN(v)) outboxDead = v;
      continue;
    }
    // http_requests_total with labels
    let m = ln.match(/^http_requests_total\{[^}]*status="(\d{3})"[^}]*\}\s+(\d+(?:\.\d+)?)/);
    if (m) {
      const code = m[1]; const val = Number(m[2]);
      if (/^5/.test(code)) http5xx += val;
      if (/^4/.test(code)) http4xx += val;
      continue;
    }
    // loyalty_quote/commit/refund_requests_total{result="..."} N
    m = ln.match(/^(loyalty_(?:quote|commit|refund)_requests_total)\{[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.\d+)?)/);
    if (m) {
      inc(`${m[1]}:${m[2]}`, Number(m[3]));
      continue;
    }
    // loyalty_outbox_events_total{type="...",result="..."} N
    m = ln.match(/^loyalty_outbox_events_total\{[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.\d+)?)/);
    if (m) {
      const res = m[1]; const val = Number(m[2]);
      outboxEventsByResult[res] = (outboxEventsByResult[res] || 0) + (isNaN(val) ? 0 : val);
      continue;
    }
  }
  return { outboxPending, outboxDead, http5xx, http4xx, circuitOpen, rateLimited, counters, outboxEvents: outboxEventsByResult };
}
