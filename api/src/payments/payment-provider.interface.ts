export interface PaymentProvider {
  /**
   * Создать платеж
   */
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  
  /**
   * Проверить статус платежа
   */
  checkPaymentStatus(paymentId: string): Promise<PaymentStatus>;
  
  /**
   * Отменить/вернуть платеж
   */
  refundPayment(paymentId: string, amount?: number): Promise<RefundResult>;
  
  /**
   * Создать подписку/рекуррентный платеж
   */
  createSubscription?(params: CreateSubscriptionParams): Promise<SubscriptionResult>;
  
  /**
   * Отменить подписку
   */
  cancelSubscription?(subscriptionId: string): Promise<void>;
  
  /**
   * Обработать вебхук
   */
  processWebhook(body: any, headers: any): Promise<WebhookResult>;
}

export interface CreatePaymentParams {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  customerId?: string;
  returnUrl?: string;
  metadata?: Record<string, any>;
  savePaymentMethod?: boolean;
}

export interface PaymentResult {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'failed';
  confirmationUrl?: string;
  amount: number;
  currency: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface PaymentStatus {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'failed';
  paid: boolean;
  amount: number;
  currency: string;
  paymentMethod?: {
    type: string;
    id?: string;
    saved?: boolean;
    title?: string;
    card?: {
      first6?: string;
      last4?: string;
      expiryMonth?: string;
      expiryYear?: string;
      cardType?: string;
    };
  };
  capturedAt?: Date;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface RefundResult {
  id: string;
  status: 'succeeded' | 'failed';
  amount: number;
  currency: string;
  createdAt: Date;
}

export interface CreateSubscriptionParams {
  planId: string;
  customerId: string;
  paymentMethodId?: string;
  trialDays?: number;
  metadata?: Record<string, any>;
}

export interface SubscriptionResult {
  id: string;
  status: 'active' | 'trialing' | 'canceled' | 'past_due';
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAt?: Date;
  planId: string;
  customerId: string;
}

export interface WebhookResult {
  type: 'payment.succeeded' | 'payment.failed' | 'payment.canceled' | 'subscription.created' | 'subscription.updated' | 'subscription.canceled' | 'refund.succeeded';
  paymentId?: string;
  subscriptionId?: string;
  status?: string;
  amount?: number;
  metadata?: Record<string, any>;
}
