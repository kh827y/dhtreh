export interface SmsProvider {
  /**
   * Отправить SMS
   */
  sendSms(params: SendSmsParams): Promise<SmsResult>;
  
  /**
   * Проверить баланс
   */
  checkBalance(): Promise<BalanceResult>;
  
  /**
   * Получить статус SMS
   */
  getSmsStatus(messageId: string): Promise<SmsStatus>;
  
  /**
   * Отправить массовую рассылку
   */
  sendBulkSms?(params: BulkSmsParams): Promise<BulkSmsResult>;
}

export interface SendSmsParams {
  phone: string; // Формат: +7XXXXXXXXXX
  message: string;
  sender?: string; // Имя отправителя (если разрешено)
  translit?: boolean; // Транслитерация в латиницу
  test?: boolean; // Тестовый режим
  time?: Date; // Отложенная отправка
  messageId?: string; // ID для идемпотентности
}

export interface SmsResult {
  id: string;
  status: 'sent' | 'queued' | 'failed';
  cost?: number;
  parts?: number; // Количество SMS частей
  error?: string;
  balance?: number; // Остаток на балансе
}

export interface BalanceResult {
  balance: number;
  currency: string;
  credit?: number; // Кредитный лимит
}

export interface SmsStatus {
  id: string;
  status: 'delivered' | 'sent' | 'failed' | 'pending' | 'expired';
  deliveredAt?: Date;
  error?: string;
}

export interface BulkSmsParams {
  messages: Array<{
    phone: string;
    message: string;
    clientId?: string; // ID клиента для отслеживания
  }>;
  sender?: string;
  translit?: boolean;
}

export interface BulkSmsResult {
  total: number;
  sent: number;
  failed: number;
  cost: number;
  messages: Array<{
    phone: string;
    id?: string;
    status: string;
    error?: string;
  }>;
}
