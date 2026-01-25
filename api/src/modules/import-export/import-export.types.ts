import { DataImportStatus } from '@prisma/client';

export interface ImportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  data: Buffer;
  updateExisting?: boolean;
  sendWelcome?: boolean;
}

export interface ImportCustomersJobDto extends ImportCustomersDto {
  sourceFileName?: string | null;
  sourceFileSize?: number | null;
  sourceMimeType?: string | null;
  uploadedById?: string | null;
}

export type ImportJobSummary = {
  jobId: string;
  status: DataImportStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  totalRows: number;
  successRows: number;
  failedRows: number;
  skippedRows: number;
  errorSummary: Array<{ row: number; error: string }>;
  stats: Record<string, unknown> | null;
};

export interface BulkUpdateCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  data: Buffer;
  operation: 'add_points' | 'set_balance' | 'add_tags' | 'update_fields';
  value?: string | null;
}

export interface ExportCustomersDto {
  merchantId: string;
  format: 'csv' | 'excel';
  fields?: string[];
  filters?: {
    status?: string;
    minBalance?: number;
    maxBalance?: number;
    hasTransactions?: boolean;
    createdFrom?: Date;
    createdTo?: Date;
  };
}

export interface CustomerImportRow {
  external_id?: string;
  phone?: string;
  name?: string;
  birthday?: string;
  gender?: string;
  email?: string;
  comment?: string;
  balance_points?: string | number;
  level?: string;
  accruals_blocked?: string | boolean | number;
  redemptions_blocked?: string | boolean | number;
  total_spent?: string | number;
  visits_count?: string | number;
  last_purchase_at?: string;
  operation_amount?: string | number;
  earn_points?: string | number;
  redeem_points?: string | number;
  transaction_date?: string;
  order_id?: string;
  receipt_number?: string;
  tags?: string;
}

export type RowRecord = Record<string, unknown>;
