export interface PushProvider {
  /**
   * Отправить push-уведомление
   */
  sendPush(params: SendPushParams): Promise<PushResult>;

  /**
   * Отправить массовую рассылку
   */
  sendBulkPush(params: BulkPushParams): Promise<BulkPushResult>;

  /**
   * Подписать устройство на топик
   */
  subscribeToTopic?(token: string, topic: string): Promise<void>;

  /**
   * Отписать устройство от топика
   */
  unsubscribeFromTopic?(token: string, topic: string): Promise<void>;

  /**
   * Отправить уведомление на топик
   */
  sendToTopic?(topic: string, params: TopicPushParams): Promise<PushResult>;
}

export interface SendPushParams {
  token: string; // FCM токен устройства
  title: string;
  body: string;
  data?: Record<string, string>; // Дополнительные данные
  image?: string; // URL изображения
  icon?: string; // URL иконки
  badge?: number; // Число на бейдже
  sound?: string; // Звук уведомления
  priority?: 'high' | 'normal';
  ttl?: number; // Time to live в секундах
  collapseKey?: string; // Группировка уведомлений
  clickAction?: string; // Действие при клике
}

export interface PushResult {
  messageId?: string;
  success: boolean;
  error?: string;
  canonicalToken?: string; // Новый токен если старый устарел
}

export interface BulkPushParams {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  image?: string;
  priority?: 'high' | 'normal';
}

export interface BulkPushResult {
  successCount: number;
  failureCount: number;
  results: Array<{
    token: string;
    messageId?: string;
    success: boolean;
    error?: string;
  }>;
}

export interface TopicPushParams {
  title: string;
  body: string;
  data?: Record<string, string>;
  image?: string;
  priority?: 'high' | 'normal';
}
