const BASE = '/api/admin';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const API_KEY_HEADER = (typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_KEY || '') : '') || 'test-key';
  const mergedHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY_HEADER,
    ...(init?.headers as any || {}),
  };
  const res = await fetch(BASE + path, { ...(init || {}), headers: mergedHeaders });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type VoucherListItem = {
  id: string;
  merchantId: string;
  name?: string;
  valueType: 'PERCENTAGE'|'FIXED_AMOUNT';
  value: number;
  status: string;
  isActive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  totalUsed: number;
  maxTotalUses?: number | null;
  codes: number;
  activeCodes: number;
  usedCodes: number;
  codeSamples: string[];
};

export async function listVouchers(merchantId: string, opts?: { status?: string; limit?: number }): Promise<{ items: VoucherListItem[] }>{
  const p = new URLSearchParams();
  p.set('merchantId', merchantId);
  if (opts?.status) p.set('status', opts.status);
  if (opts?.limit != null) p.set('limit', String(opts.limit));
  return http(`/vouchers/list?${p.toString()}`);
}

export function exportVouchersCsvUrl(merchantId: string, opts?: { status?: string }): string {
  const p = new URLSearchParams();
  p.set('merchantId', merchantId);
  if (opts?.status) p.set('status', opts.status);
  return `/api/admin/vouchers/export.csv?${p.toString()}`;
}

export async function issueVoucher(args: { merchantId: string; name?: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; code: string; validFrom?: string; validUntil?: string; minPurchaseAmount?: number }) {
  return http(`/vouchers/issue`, { method: 'POST', body: JSON.stringify(args) });
}

export async function deactivateVoucher(args: { merchantId: string; code?: string; voucherId?: string }) {
  return http(`/vouchers/deactivate`, { method: 'POST', body: JSON.stringify(args) });
}

export async function voucherStatus(args: { merchantId: string; code?: string; voucherId?: string }): Promise<{ voucherId?: string; codeId?: string | null; code?: string | null; voucherStatus?: string; voucherActive?: boolean; codeStatus?: string; codeUsedCount?: number; codeMaxUses?: number | null; validFrom?: string | null; validUntil?: string | null }>{
  return http(`/vouchers/status`, { method: 'POST', body: JSON.stringify(args) });
}

export async function previewVoucher(args: { merchantId: string; code: string; eligibleTotal: number; customerId?: string }): Promise<{ canApply: boolean; discount: number; voucherId?: string; codeId?: string; reason?: string | null }>{
  return http(`/vouchers/preview`, { method: 'POST', body: JSON.stringify(args) });
}
