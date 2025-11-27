import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

type AlertSeverity = 'info' | 'warn' | 'critical';

type AlertEvent = {
  id: string;
  at: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  delivered: boolean;
  throttled: boolean;
  error?: string;
};

type NotifyOptions = {
  title?: string;
  severity?: AlertSeverity;
  throttleKey?: string;
  throttleMinutes?: number;
  force?: boolean;
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private recent: AlertEvent[] = [];
  private throttleMap: Map<string, number> = new Map();
  private readonly maxRecent = 50;

  private get tgToken(): string | undefined {
    const v = process.env.ALERT_TELEGRAM_BOT_TOKEN;
    return v && v.trim() ? v.trim() : undefined;
  }
  private get tgChatId(): string | undefined {
    const v = process.env.ALERT_TELEGRAM_CHAT_ID;
    return v && v.trim() ? v.trim() : undefined;
  }

  private isConfigured(): boolean {
    return !!this.tgToken && !!this.tgChatId;
  }

  private pushRecent(evt: AlertEvent) {
    this.recent.push(evt);
    if (this.recent.length > this.maxRecent) {
      this.recent = this.recent.slice(-this.maxRecent);
    }
  }

  getRecent(): AlertEvent[] {
    return [...this.recent].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }

  getStatus() {
    const sampleRate = Number(process.env.ALERTS_5XX_SAMPLE_RATE || '0');
    const chatMask = this.tgChatId
      ? `***${String(this.tgChatId).slice(-4)}`
      : null;
    return {
      enabled: this.isConfigured(),
      chatId: chatMask,
      sampleRate,
    };
  }

  private isThrottled(
    key: string | undefined,
    ttlMinutes: number,
    force?: boolean,
  ): boolean {
    if (!key || ttlMinutes <= 0 || force) return false;
    const now = Date.now();
    const until = this.throttleMap.get(key);
    if (until && until > now) return true;
    const next = now + ttlMinutes * 60 * 1000;
    this.throttleMap.set(key, next);
    return false;
  }

  async notifyText(text: string, opts?: NotifyOptions): Promise<void> {
    const at = new Date();
    const severity: AlertSeverity = opts?.severity ?? 'info';
    const title = opts?.title || 'alert';
    const throttleMinutes = Math.max(0, opts?.throttleMinutes ?? 0);
    const throttled = this.isThrottled(
      opts?.throttleKey,
      throttleMinutes,
      opts?.force,
    );

    const event: AlertEvent = {
      id:
        at.toISOString() +
        '_' +
        Math.random().toString(36).slice(2, 8) +
        (opts?.throttleKey ? `_${opts.throttleKey}` : ''),
      at: at.toISOString(),
      severity,
      title,
      message: text.trim(),
      delivered: false,
      throttled,
    };
    this.pushRecent(event);
    if (throttled) return;
    if (!this.isConfigured()) return;
    try {
      const url = `https://api.telegram.org/bot${this.tgToken}/sendMessage`;
      await axios.post(
        url,
        {
          chat_id: this.tgChatId,
          text,
          disable_web_page_preview: true,
        },
        { timeout: 5000 },
      );
      event.delivered = true;
    } catch (e) {
      event.error = String((e as any)?.message || e);
      this.logger.warn(`Failed to send alert: ${event.error}`);
    }
  }

  async notifyIncident(params: {
    title: string;
    lines: string[];
    severity?: AlertSeverity;
    throttleKey?: string;
    throttleMinutes?: number;
    force?: boolean;
  }): Promise<void> {
    const env = process.env.NODE_ENV || 'development';
    const version = process.env.APP_VERSION || 'dev';
    const header = [`[${env}] ${params.title}`, `version: ${version}`];
    const text = [...header, ...params.lines.filter(Boolean)].join('\n');
    await this.notifyText(text, {
      title: params.title,
      severity: params.severity ?? 'info',
      throttleKey: params.throttleKey,
      throttleMinutes: params.throttleMinutes,
      force: params.force,
    });
  }

  async antifraudBlocked(params: {
    merchantId: string;
    reason: 'risk' | 'velocity' | 'factor';
    level?: string;
    scope?: string;
    factor?: string;
    ctx?: Record<string, any>;
  }): Promise<void> {
    const ts = new Date().toISOString();
    const lns: string[] = [];
    lns.push('⚠️ Антифрод блокировка');
    lns.push(`merchant: ${params.merchantId}`);
    lns.push(`reason: ${params.reason}`);
    if (params.level) lns.push(`level: ${params.level}`);
    if (params.scope) lns.push(`scope: ${params.scope}`);
    if (params.factor) lns.push(`factor: ${params.factor}`);
    lns.push(`time: ${ts}`);
    await this.notifyIncident({
      title: 'Антифрод блокировка',
      lines: lns,
      severity: 'warn',
      throttleKey: `antifraud:${params.merchantId}:${params.reason}`,
      throttleMinutes: 5,
    });
  }
}
