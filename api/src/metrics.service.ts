import { Injectable } from '@nestjs/common';

type CMap = { [k: string]: number };

@Injectable()
export class MetricsService {
  private counters: CMap = Object.create(null);
  private sums: CMap = Object.create(null);
  private counts: CMap = Object.create(null);
  private gauges: CMap = Object.create(null);

  inc(name: string, labels: Record<string, string> = {}, value = 1) {
    const key = this.key(name, labels);
    this.counters[key] = (this.counters[key] || 0) + value;
  }

  observe(name: string, ms: number, labels: Record<string, string> = {}) {
    const sumKey = this.key(name + '_sum', labels);
    const cntKey = this.key(name + '_count', labels);
    this.sums[sumKey] = (this.sums[sumKey] || 0) + ms;
    this.counts[cntKey] = (this.counts[cntKey] || 0) + 1;
  }

  setGauge(name: string, v: number, labels: Record<string, string> = {}) {
    const key = this.key(name, labels);
    this.gauges[key] = v;
  }

  exportProm(): string {
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
    lines.push('# HELP loyalty_outbox_sent_total Total outbox sent');
    lines.push('# TYPE loyalty_outbox_sent_total counter');
    lines.push('# HELP loyalty_outbox_failed_total Total outbox failed');
    lines.push('# TYPE loyalty_outbox_failed_total counter');
    lines.push('# HELP loyalty_outbox_pending Current outbox pending gauge');
    lines.push('# TYPE loyalty_outbox_pending gauge');
    lines.push('# HELP loyalty_jwt_expired_total Total JWT expired errors');
    lines.push('# TYPE loyalty_jwt_expired_total counter');
    lines.push('# HELP loyalty_hold_gc_canceled_total Holds canceled by GC');
    lines.push('# TYPE loyalty_hold_gc_canceled_total counter');

    for (const [key, v] of Object.entries(this.counters)) {
      lines.push(`${key} ${v}`);
    }
    for (const [key, v] of Object.entries(this.sums)) {
      lines.push(`${key} ${v}`);
    }
    for (const [key, v] of Object.entries(this.counts)) {
      lines.push(`${key} ${v}`);
    }
    for (const [key, v] of Object.entries(this.gauges)) {
      lines.push(`${key} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  private key(name: string, labels: Record<string, string>): string {
    const lbls = Object.keys(labels).sort().map(k => `${k}="${labels[k]}"`).join(',');
    return lbls ? `${name}{${lbls}}` : name;
    }
}

