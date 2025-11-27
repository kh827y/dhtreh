export type MetricsSummary = {
  outboxPending: number;
  outboxDead: number;
  http5xx: number;
  http4xx: number;
  circuitOpen: number;
  rateLimited: number;
  counters: Record<string, number>;
  outboxEvents: Record<string, number>;
  posWebhooks: Record<string, number>;
  posRequests: Record<string, Record<string, Record<string, number>>>;
  posErrors: Record<string, Record<string, number>>;
};

export function parsePromMetrics(text: string): MetricsSummary {
  const lines = text.split(/\r?\n/);
  let outboxPending = 0;
  let outboxDead = 0;
  let http5xx = 0;
  let http4xx = 0;
  let circuitOpen = 0;
  let rateLimited = 0;
  const counters: Record<string, number> = {};
  const outboxEvents: Record<string, number> = {};
  const posWebhooks: Record<string, number> = {};
  const posRequests: Record<string, Record<string, Record<string, number>>> =
    {};
  const posErrors: Record<string, Record<string, number>> = {};
  const inc = (k: string, v: number) => {
    counters[k] = (counters[k] || 0) + v;
  };

  for (const ln of lines) {
    if (!ln || ln.startsWith('#')) continue;
    if (ln.startsWith('loyalty_outbox_pending ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!Number.isNaN(v)) outboxPending = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_circuit_open ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!Number.isNaN(v)) circuitOpen = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_rate_limited_total ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!Number.isNaN(v)) rateLimited = v;
      continue;
    }
    if (ln.startsWith('loyalty_outbox_dead_total ')) {
      const v = Number(ln.split(' ')[1] || '0');
      if (!Number.isNaN(v)) outboxDead = v;
      continue;
    }
    let m = ln.match(
      /^http_requests_total\{[^}]*status="(\d{3})"[^}]*\}\s+(\d+(?:\.\d+)?)/,
    );
    if (m) {
      const code = m[1];
      const val = Number(m[2]);
      if (/^5/.test(code)) http5xx += val;
      if (/^4/.test(code)) http4xx += val;
      continue;
    }
    m = ln.match(
      /^(loyalty_(?:quote|commit|refund)_requests_total)\{[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.\d+)?)/,
    );
    if (m) {
      inc(`${m[1]}:${m[2]}`, Number(m[3]));
      continue;
    }
    m = ln.match(
      /^loyalty_outbox_events_total\{[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/,
    );
    if (m) {
      const res = m[1];
      const val = Number(m[2]);
      outboxEvents[res] = (outboxEvents[res] || 0) + (Number.isNaN(val) ? 0 : val);
      continue;
    }
    m = ln.match(
      /^pos_webhooks_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/,
    );
    if (m) {
      const provider = m[1];
      const val = Number(m[2]);
      posWebhooks[provider] =
        (posWebhooks[provider] || 0) + (Number.isNaN(val) ? 0 : val);
      continue;
    }
    m = ln.match(
      /^pos_requests_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*endpoint="([a-zA-Z0-9_\-]+)"[^}]*result="([a-zA-Z_]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/,
    );
    if (m) {
      const provider = m[1];
      const endpoint = m[2];
      const result = m[3];
      const val = Number(m[4]);
      posRequests[provider] = posRequests[provider] || {};
      posRequests[provider][endpoint] =
        posRequests[provider][endpoint] || {};
      posRequests[provider][endpoint][result] =
        (posRequests[provider][endpoint][result] || 0) +
        (Number.isNaN(val) ? 0 : val);
      continue;
    }
    m = ln.match(
      /^pos_errors_total\{[^}]*provider="([A-Z0-9_]+)"[^}]*endpoint="([a-zA-Z0-9_\-]+)"[^}]*\}\s+(\d+(?:\.[0-9]+)?)/,
    );
    if (m) {
      const provider = m[1];
      const endpoint = m[2];
      const val = Number(m[3]);
      posErrors[provider] = posErrors[provider] || {};
      posErrors[provider][endpoint] =
        (posErrors[provider][endpoint] || 0) + (Number.isNaN(val) ? 0 : val);
      continue;
    }
  }

  return {
    outboxPending,
    outboxDead,
    http5xx,
    http4xx,
    circuitOpen,
    rateLimited,
    counters,
    outboxEvents,
    posWebhooks,
    posRequests,
    posErrors,
  };
}
