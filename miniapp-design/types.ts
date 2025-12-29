
export enum UserLevel {
  BASE = 'Base',
  SILVER = 'Silver',
  GOLD = 'Gold',
  PLATINUM = 'Platinum'
}

export type TransactionType = 
  | 'purchase'          // Покупка
  | 'admin_bonus'       // Подарочные баллы от админа
  | 'refund'            // Возврат покупки
  | 'birthday'          // День рождения
  | 'signup'            // Регистрация
  | 'referral'          // Реферальное начисление
  | 'referral_refund'   // Возврат реферала (списание)
  | 'expiration'        // Сгорание баллов
  | 'promo'             // Промокод
  | 'campaign';         // Акция

export interface Transaction {
  id: string;
  title: string;
  description?: string; // Optional subtitle (e.g. admin comment)
  date: string;
  amount: number;       // Money involved (0 if purely bonus)
  cashback: number;     // Points accrued (earned)
  pointsBurned?: number; // Points redeemed (spent)
  type: TransactionType;
}

export interface MerchantConfig {
  hasReferralProgram: boolean;
  referralDescription?: string;
  reviewTriggerThreshold: number; // Оценка (1-5), при которой просим поделиться отзывом
  levels: {
    name: UserLevel;
    threshold: number;
    cashbackPercent: number;
    writeOffPercent: number; // Максимальный % списания чека баллами
  }[];
}

export interface User {
  id: string;
  name: string;
  balance: number;
  currentLevel: UserLevel;
  totalSpent: number;
  cashbackPercent: number;
  transactions: Transaction[];
  notificationConsent: boolean;
  // New fields for Onboarding
  phone?: string;
  gender?: 'male' | 'female';
  birthDate?: string;
}

export type PromoType = 'bonus' | 'discount' | 'multiplier' | 'bundle' | 'cashback' | 'fixed_bonus';

export interface Promo {
  id: string;
  type: PromoType;
  title: string;
  description?: string; // Used for product promos
  duration?: string; // e.g. "до 31 октября"
  
  // For 'bonus' type or 'fixed_bonus'
  bonusAmount?: number; 
  
  // For product types
  price?: number;
  oldPrice?: number;
  multiplier?: number; // e.g., 2 for "x2 points"
  cashbackPercent?: number; // e.g., 20 for "20% cashback"
  bundleLabel?: string; // e.g., "2+1"
  imageUrl?: string; // Or color class if no image
  color?: string; // Background accent
}

export type ViewState = 'ONBOARDING' | 'HOME' | 'HISTORY' | 'SETTINGS' | 'PROMOS' | 'INVITE' | 'ABOUT';
