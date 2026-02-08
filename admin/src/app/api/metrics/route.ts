import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../_lib/session';
export const runtime = 'nodejs';

const API_BASE = (process.env.API_BASE || '').replace(/\/$/, '');
const METRICS_TOKEN = process.env.METRICS_TOKEN || '';
const METRICS_TIMEOUT_MS = (() => {
  const raw = Number(process.env.ADMIN_METRICS_TIMEOUT_MS || '');
  if (!Number.isFinite(raw)) return 15_000;
  return Math.min(Math.max(Math.trunc(raw), 1_000), 120_000);
})();

export async function GET(req: NextRequest) {
  if (!API_BASE) return new Response('API_BASE not configured', { status: 500 });
  {
    const auth = requireSession(req);
    if (auth) return auth;
  }
  let timedOut = false;
  try {
    const headers: Record<string, string> = {};
    if (METRICS_TOKEN) headers['X-Metrics-Token'] = METRICS_TOKEN;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, METRICS_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(API_BASE + '/metrics', {
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (timedOut) {
      return new Response(
        `Metrics upstream timeout after ${METRICS_TIMEOUT_MS}ms`,
        { status: 504 },
      );
    }
    const text = await res.text();
    if (!res.ok) return new Response(text || 'metrics error', { status: 502 });
    const summary = parseMetrics(text);
    return NextResponse.json(summary);
  } catch (e: unknown) {
    if (timedOut) {
      return new Response(
        `Metrics upstream timeout after ${METRICS_TIMEOUT_MS}ms`,
        { status: 504 },
      );
    }
    return new Response(String(e instanceof Error ? e.message : e), { status: 500 });
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
  const posWebhooks: Record<string, number> = {};
  const posRequests: Record<string, Record<string, Record<string, number>>> = {};
  const posErrors: Record<string, Record<string, number>> = {};
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
    m = ln.match(/^loyalty_outbox_events_total\{[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/);
    if (m) {
      const res = m[1]; const val = Number(m[2]);
      outboxEventsByResult[res] = (outboxEventsByResult[res] || 0) + (isNaN(val) ? 0 : val);
      continue;
    }
    // pos_webhooks_total{provider="..."} N
    m = ln.match(/^pos_webhooks_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/);
    if (m) {
      const provider = m[1]; const val = Number(m[2]);
      posWebhooks[provider] = (posWebhooks[provider] || 0) + (isNaN(val) ? 0 : val);
      continue;
    }
    // pos_requests_total{provider,endpoint,result} N
    m = ln.match(/^pos_requests_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*endpoint="([a-zA-Z0-9_\-]+)"[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/);
    if (m) {
      const provider = m[1]; const endpoint = m[2]; const result = m[3]; const val = Number(m[4]);
      posRequests[provider] = posRequests[provider] || {};
      posRequests[provider][endpoint] = posRequests[provider][endpoint] || {};
      posRequests[provider][endpoint][result] = (posRequests[provider][endpoint][result] || 0) + (isNaN(val) ? 0 : val);
      continue;
    }
    // pos_errors_total{provider,endpoint} N
    m = ln.match(/^pos_errors_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*endpoint="([a-zA-Z0-9_\-]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/);
    if (m) {
      const provider = m[1]; const endpoint = m[2]; const val = Number(m[3]);
      posErrors[provider] = posErrors[provider] || {};
      posErrors[provider][endpoint] = (posErrors[provider][endpoint] || 0) + (isNaN(val) ? 0 : val);
      continue;
    }
  }
  return { outboxPending, outboxDead, http5xx, http4xx, circuitOpen, rateLimited, counters, outboxEvents: outboxEventsByResult, posWebhooks, posRequests, posErrors };
}
