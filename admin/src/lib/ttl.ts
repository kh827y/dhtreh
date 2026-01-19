const BASE = '/api/admin';

async function http<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as T;
}

export type TtlItem = { customerId: string; expiredRemain: number; burned: number; diff: number };
export type TtlRecon = { merchantId: string; cutoff: string; items: TtlItem[]; totals: { expiredRemain: number; burned: number; diff: number } };

export async function ttlReconciliation(merchantId: string, cutoffISO: string): Promise<TtlRecon> {
  return http(`/merchants/${encodeURIComponent(merchantId)}/ttl/reconciliation?cutoff=${encodeURIComponent(cutoffISO)}`);
}

