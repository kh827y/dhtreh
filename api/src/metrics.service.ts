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
  private outboxPendingGauge?: Gauge;
  private commitLatencyHist?: Histogram;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });
    // Known metrics via prom-client (без динамических лейблов)
    this.outboxSent = new Counter({ name: 'loyalty_outbox_sent_total', help: 'Total outbox sent events', registers: [this.registry] });
    this.outboxFailed = new Counter({ name: 'loyalty_outbox_failed_total', help: 'Total outbox failed events', registers: [this.registry] });
    this.outboxPendingGauge = new Gauge({ name: 'loyalty_outbox_pending', help: 'Current outbox pending', registers: [this.registry] });
    this.commitLatencyHist = new Histogram({ name: 'loyalty_commit_latency_seconds', help: 'Commit latency seconds', buckets: [0.05,0.1,0.2,0.5,1,2,5,10], registers: [this.registry] });
  }

  inc(name: string, labels: Record<string, string> = {}, value = 1) {
    const key = this.key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
    // Mirror selected counters to prom-client
    if (name === 'loyalty_outbox_sent_total') this.outboxSent?.inc(value);
    if (name === 'loyalty_outbox_failed_total') this.outboxFailed?.inc(value);
  }

  observe(name: string, ms: number, labels: Record<string, string> = {}) {
    const sumKey = this.key(name + '_sum', labels);
    const cntKey = this.key(name + '_count', labels);
    this.sums[sumKey] = (this.sums[sumKey] || 0) + ms;
    this.counts[cntKey] = (this.counts[cntKey] || 0) + 1;
    if (name === 'loyalty_commit_latency_ms') this.commitLatencyHist?.observe(ms / 1000);
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

  private key(name: string, labels: Record<string, string>): string {
    const lbls = Object.keys(labels).sort().map(k => `${k}="${labels[k]}"`).join(',');
    return lbls ? `${name}{${lbls}}` : name;
    }
}
