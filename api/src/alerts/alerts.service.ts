import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  private get tgToken(): string | undefined {
    const v = process.env.ALERT_TELEGRAM_BOT_TOKEN;
    return v && v.trim() ? v.trim() : undefined;
  }
  private get tgChatId(): string | undefined {
    const v = process.env.ALERT_TELEGRAM_CHAT_ID;
    return v && v.trim() ? v.trim() : undefined;
  }

  async notifyText(text: string): Promise<void> {
    try {
      if (!this.tgToken || !this.tgChatId) return; // no-op if not configured
      const url = `https://api.telegram.org/bot${this.tgToken}/sendMessage`;
      await axios.post(
        url,
        {
          chat_id: this.tgChatId,
          text,
          disable_web_page_preview: true,
          parse_mode: 'Markdown',
        },
        { timeout: 5000 },
      );
    } catch (e) {
      this.logger.warn(`Failed to send alert: ${e}`);
    }
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
    lns.push(`\u26a0\ufe0f Антифрод блокировка`);
    lns.push(`merchant: ${params.merchantId}`);
    lns.push(`reason: ${params.reason}`);
    if (params.level) lns.push(`level: ${params.level}`);
    if (params.scope) lns.push(`scope: ${params.scope}`);
    if (params.factor) lns.push(`factor: ${params.factor}`);
    lns.push(`time: ${ts}`);
    const text = lns.join('\n');
    await this.notifyText(text);
  }
}
