
export interface KPIData {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  iconType: 'chart' | 'user' | 'currency' | 'bar';
}

export interface SalesDataPoint {
  date: string;
  registrations: number;
  sales: number;
  amount: number;
}

export interface AgeGroupData {
  age: string;
  value: number;
  secondaryValue: number;
}

export interface DemographicsData {
  gender: { name: string; value: number; color: string }[];
  age: AgeGroupData[];
}

export enum TimePeriod {
  Day = 'Day',
  Week = 'Week',
  Month = 'Month',
  Year = 'Year'
}

export type AppView = 
  | 'summary' 
  | 'settings'
  | 'by_time' 
  | 'portrait' 
  | 'repeat' 
  | 'dynamics' 
  | 'rfm' 
  | 'outlet' 
  | 'staff' 
  | 'referral' 
  | 'loyalty_mechanics' 
  | 'loyalty_levels'
  | 'loyalty_limitations'
  | 'promotions' 
  | 'points_promotions'
  | 'operations_log'
  | 'push_notifications'
  | 'telegram_newsletters'
  | 'promocodes'
  | 'staff_motivation'
  | 'fraud_protection'
  | 'cashier_panel'
  | 'cashier_mode' 
  | 'cashier_mode_mobile' /* NEW VIEW */
  | 'reviews'
  | 'clients'
  | 'audiences'
  | 'goods_list'
  | 'categories_list'
  | 'outlets'
  | 'settings_staff'
  | 'settings_access_groups'
  | 'settings_integrations'
  | 'integration_telegram_miniapp'
  | 'integration_rest_api'
  | 'settings_telegram'
  | 'settings_system'
  | 'tools_import'
  | 'autoreturn'
  | 'autoreturn_stats'
  | 'birthday'
  | 'birthday_stats'
  | 'registration_points'
  | 'registration_points_stats'
  | 'expiration_reminder'
  | 'referral_settings';