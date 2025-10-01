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
  outletId: string; // идентификатор торговой точки; обязателен для трекинга POS
  staffId?: string;
  category?: string;
}

export interface LoyaltyCommitRequest {
  merchantId: string;
  holdId: string;
  orderId: string;
  outletId?: string; // для совместимости передавайте ту же точку, что и при quote
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

// Единый контракт для ERP интеграций (каталоги/стоки/цены и т.п.)
export interface ERPAdapter {
  name: string;
  // Синхронизация товаров
  syncProducts(since?: Date): Promise<{ imported: number; updated: number; errors?: number }>;
  // Синхронизация остатков
  syncInventory?(since?: Date): Promise<{ imported: number; updated: number; errors?: number }>;
  // Синхронизация клиентов
  syncCustomers?(since?: Date): Promise<{ imported: number; updated: number; errors?: number }>;
  // Вебхуки/уведомления от ERP
  handleWebhook?(payload: any): Promise<any>;
  healthCheck(): Promise<boolean>;
}

// Контракт для служб доставки
export interface ShipperAdapter {
  name: string;
  createShipment(orderId: string, payload: any): Promise<{ shipmentId: string; status: string }>;
  cancelShipment(shipmentId: string): Promise<{ ok: boolean }>;
  trackShipment(shipmentId: string): Promise<{ status: string; eta?: string }>;
  handleWebhook?(payload: any): Promise<any>;
  healthCheck(): Promise<boolean>;
}
