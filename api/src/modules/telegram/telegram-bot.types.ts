export interface BotConfig {
  token: string;
  username: string;
  merchantId: string;
  webhookUrl: string;
}

export interface RegisterBotResult {
  success: boolean;
  username: string;
  webhookUrl: string;
  webhookError?: string | null;
}

export interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections: number;
  ip_address?: string;
}

export type TelegramUpdateRecord = {
  message?: Record<string, unknown>;
  callback_query?: Record<string, unknown>;
};
