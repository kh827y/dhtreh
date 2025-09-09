import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

type CMap = { [k: string]: number };

@Injectable()
export class MetricsService {
  private counters: CMap = Object.create(null);
  private sums: CMap = Object.create(null);
  private counts: CMap = Object.create(null);
  private gauges: CMap = Object.create(null);
  private registry: Registry;
  private outboxSent?: Counter;
  private outboxFailed?: Counter;
  private outboxDead?: Counter;
  private outboxPendingGauge?: Gauge;
  private commitLatencyHist?: Histogram;
  private reqQuote?: Counter<string>;
  private reqCommit?: Counter<string>;
  private reqRefund?: Counter<string>;
  private quoteLatencyHist?: Histogram;
  private httpReqCounter?: Counter<string>;
  private httpReqDuration?: Histogram<string>;
  private ledgerEntries?: Counter<string>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    // Known metrics via prom-client (без динамических лейблов)
    this.outboxSent = new Counter({ name: 'loyalty_outbox_sent_total', help: 'Total outbox sent events', registers: [this.registry] });
    this.outboxFailed = new Counter({ name: 'loyalty_outbox_failed_total', help: 'Total outbox failed events', registers: [this.registry] });
    this.outboxDead = new Counter({ name: 'loyalty_outbox_dead_total', help: 'Total outbox dead events', registers: [this.registry] });
    this.outboxPendingGauge = new Gauge({ name: 'loyalty_outbox_pending', help: 'Current outbox pending', registers: [this.registry] });
    this.commitLatencyHist = new Histogram({ name: 'loyalty_commit_latency_seconds', help: 'Commit latency seconds', buckets: [0.05,0.1,0.2,0.5,1,2,5,10], registers: [this.registry] });
    this.reqQuote = new Counter({ name: 'loyalty_quote_requests_total', help: 'Quote requests', labelNames: ['result'], registers: [this.registry] });
    this.reqCommit = new Counter({ name: 'loyalty_commit_requests_total', help: 'Commit requests', labelNames: ['result'], registers: [this.registry] });
    this.reqRefund = new Counter({ name: 'loyalty_refund_requests_total', help: 'Refund requests', labelNames: ['result'], registers: [this.registry] });
    this.quoteLatencyHist = new Histogram({ name: 'loyalty_quote_latency_seconds', help: 'Quote latency seconds', buckets: [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5], registers: [this.registry] });
    this.httpReqCounter = new Counter({ name: 'http_requests_total', help: 'HTTP requests total', labelNames: ['method','route','status'], registers: [this.registry] });
    this.httpReqDuration = new Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration seconds', labelNames: ['method','route','status'], buckets: [0.01,0.025,0.05,0.1,0.2,0.5,1,2,5], registers: [this.registry] });
    this.ledgerEntries = new Counter({ name: 'loyalty_ledger_entries_total', help: 'Ledger entries created', labelNames: ['type'], registers: [this.registry] });
  }

  inc(name: string, labels: Record<string, string> = {}, value = 1) {
    const key = this.key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
    // Mirror selected counters to prom-client
    if (name === 'loyalty_outbox_sent_total') this.outboxSent?.inc(value);
    if (name === 'loyalty_outbox_failed_total') this.outboxFailed?.inc(value);
    if (name === 'loyalty_outbox_dead_total') this.outboxDead?.inc(value);
    if (name === 'loyalty_quote_requests_total' && labels?.result) this.reqQuote?.inc({ result: labels.result }, value);
    if (name === 'loyalty_commit_requests_total' && labels?.result) this.reqCommit?.inc({ result: labels.result }, value);
    if (name === 'loyalty_refund_requests_total' && labels?.result) this.reqRefund?.inc({ result: labels.result }, value);
    if (name === 'loyalty_ledger_entries_total' && labels?.type) this.ledgerEntries?.inc({ type: labels.type }, value);
  }

  observe(name: string, ms: number, labels: Record<string, string> = {}) {
    const sumKey = this.key(name + '_sum', labels);
    const cntKey = this.key(name + '_count', labels);
    this.sums[sumKey] = (this.sums[sumKey] || 0) + ms;
    this.counts[cntKey] = (this.counts[cntKey] || 0) + 1;
    if (name === 'loyalty_commit_latency_ms') this.commitLatencyHist?.observe(ms / 1000);
    if (name === 'loyalty_quote_latency_ms') this.quoteLatencyHist?.observe(ms / 1000);
  }

  setGauge(name: string, v: number, labels: Record<string, string> = {}) {
    const key = this.key(name, labels);
    this.gauges[key] = v;
    if (name === 'loyalty_outbox_pending') this.outboxPendingGauge?.set(v);
  }

  async exportProm(): Promise<string> {
    const lines: string[] = [];
    // help/type
    lines.push('# HELP loyalty_quote_requests_total Total quote requests by result');
    lines.push('# TYPE loyalty_quote_requests_total counter');
    lines.push('# HELP loyalty_commit_requests_total Total commit requests by result');
    lines.push('# TYPE loyalty_commit_requests_total counter');
    lines.push('# HELP loyalty_commit_latency_ms Commit latency milliseconds');
    lines.push('# TYPE loyalty_commit_latency_ms summary');
    lines.push('# HELP loyalty_refund_requests_total Total refund requests by result');
    lines.push('# TYPE loyalty_refund_requests_total counter');
    lines.push('# HELP loyalty_jwt_expired_total Total JWT expired errors');
    lines.push('# TYPE loyalty_jwt_expired_total counter');
    lines.push('# HELP loyalty_hold_gc_canceled_total Holds canceled by GC');
    lines.push('# TYPE loyalty_hold_gc_canceled_total counter');

    // legacy counters/summaries, исключая те, что отражаем через prom-client
    const skip = new Set(['loyalty_outbox_sent_total','loyalty_outbox_failed_total','loyalty_outbox_pending','loyalty_commit_latency_ms','loyalty_commit_latency_ms_sum','loyalty_commit_latency_ms_count']);
    for (const [key, v] of Object.entries(this.counters)) { if (!skip.has(key)) lines.push(`${key} ${v}`); }
    for (const [key, v] of Object.entries(this.sums)) { if (!skip.has(key)) lines.push(`${key} ${v}`); }
    for (const [key, v] of Object.entries(this.counts)) { if (!skip.has(key)) lines.push(`${key} ${v}`); }
    for (const [key, v] of Object.entries(this.gauges)) { if (!skip.has(key)) lines.push(`${key} ${v}`); }

    // Добавляем prom-client метрики
    try {
      const prom = await this.registry.metrics();
      lines.push(prom);
    } catch {}
    return lines.join('\n') + (lines.length ? '\n' : '');
  }

  recordHttp(method: string, route: string, status: number, seconds: number) {
    try {
      const m = String(method || '').toUpperCase();
      const r = route || 'unknown';
      const s = String(status || 0);
      this.httpReqCounter?.inc({ method: m, route: r, status: s });
      this.httpReqDuration?.observe({ method: m, route: r, status: s }, seconds);
    } catch {}
  }

  private key(name: string, labels: Record<string, string>): string {
    const lbls = Object.keys(labels).sort().map(k => `${k}="${labels[k]}"`).join(',');
    return lbls ? `${name}{${lbls}}` : name;
    }
}
