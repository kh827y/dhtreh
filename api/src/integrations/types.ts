export interface PosReceipt {
  orderId: string;
  total: number;      // сумма чека, копейки
  eligibleTotal?: number; // допустимая к начислению/списанию сумма, копейки
  items?: Array<{ sku?: string; name?: string; price: number; qty: number; sum: number; category?: string }>;
  customerId?: string;   // внешний ID клиента (если есть привязка)
}

export interface LoyaltyQuoteRequest {
  merchantId: string;
  userToken: string; // QR токен (JWT) или plain customerId
  total: number; // копейки
  eligibleTotal: number; // копейки
  orderId?: string;
  outletId?: string;
  deviceId?: string;
  staffId?: string;
  category?: string;
}

export interface LoyaltyCommitRequest {
  merchantId: string;
  holdId: string;
  orderId: string;
  receiptNumber?: string;
}

export interface PosAdapter {
  name: string;
  // Вызов из интеграции при продаже: получить предложение по лояльности
  quoteLoyalty(req: LoyaltyQuoteRequest): Promise<any>;
  // Зафиксировать операцию после успешной оплаты
  commitLoyalty(req: LoyaltyCommitRequest): Promise<any>;
  // Обработать вебхук провайдера
  handleWebhook(payload: any): Promise<any>;
  // Здоровье
  healthCheck(): Promise<boolean>;
}
