import type { ResolvedPosition } from './loyalty-ops.types';

export const allocateProRata = (
  amounts: number[],
  target: number,
): number[] => {
  const normalizedTarget = Math.max(0, Math.floor(Number(target) || 0));
  const total = amounts.reduce((sum, v) => sum + Math.max(0, Math.floor(v)), 0);
  if (total <= 0 || normalizedTarget <= 0) return amounts.map(() => 0);
  const targetClamped = Math.min(normalizedTarget, total);
  const shares = amounts.map((amount) =>
    Math.floor((Math.max(0, Math.floor(amount)) * targetClamped) / total),
  );
  let distributed = shares.reduce((sum, v) => sum + v, 0);
  let idx = 0;
  while (distributed < targetClamped && idx < shares.length) {
    const canAdd = Math.max(0, Math.floor(amounts[idx])) > 0;
    if (canAdd) {
      shares[idx] += 1;
      distributed += 1;
    }
    idx = (idx + 1) % shares.length;
  }
  return shares;
};

export const allocateByWeight = (
  weights: number[],
  total: number,
): number[] => {
  const sanitizedWeights = weights.map((w) =>
    Math.max(0, Math.floor(Number.isFinite(w) ? w : 0)),
  );
  const sum = sanitizedWeights.reduce((acc, v) => acc + v, 0);
  if (sum <= 0 || total <= 0) return sanitizedWeights.map(() => 0);
  const target = Math.max(0, Math.floor(total));
  const shares = sanitizedWeights.map((w) => Math.floor((w * target) / sum));
  let distributed = shares.reduce((acc, v) => acc + v, 0);
  let idx = 0;
  while (distributed < target && idx < shares.length) {
    if (sanitizedWeights[idx] > 0) {
      shares[idx] += 1;
      distributed += 1;
    }
    idx = (idx + 1) % shares.length;
  }
  return shares;
};

export const normalizePercent = (value: unknown, fallback = 100): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
};

export const computeRedeemCaps = (items: ResolvedPosition[]): number[] =>
  items.map((item) => {
    if (item.allowEarnAndPay === false) return 0;
    const amount = Math.max(0, Math.floor(Number(item.amount || 0)));
    if (amount <= 0) return 0;
    const percent = normalizePercent(item.redeemPercent, 100);
    return Math.floor((amount * percent) / 100);
  });

export const allocateProRataWithCaps = (
  weights: number[],
  caps: number[],
  total: number,
): number[] => {
  const length = Math.min(weights.length, caps.length);
  if (length <= 0) return [];
  const shares = new Array<number>(length).fill(0);
  const remainingCaps = caps
    .slice(0, length)
    .map((cap) => Math.max(0, Math.floor(Number(cap) || 0)));
  let remaining = Math.max(0, Math.floor(Number(total) || 0));
  if (!remaining) return shares;
  const active = new Set<number>();
  for (let i = 0; i < length; i += 1) {
    const weight = Math.max(0, Math.floor(Number(weights[i]) || 0));
    if (weight > 0 && remainingCaps[i] > 0) active.add(i);
  }
  while (remaining > 0 && active.size > 0) {
    const activeIndices = Array.from(active);
    const activeWeights = activeIndices.map((idx) =>
      Math.max(0, Math.floor(Number(weights[idx]) || 0)),
    );
    const sumWeights = activeWeights.reduce((acc, v) => acc + v, 0);
    if (sumWeights <= 0) break;
    const provisional = allocateProRata(activeWeights, remaining);
    let capped = false;
    activeIndices.forEach((idx, pos) => {
      const cap = remainingCaps[idx];
      if (cap <= 0) {
        active.delete(idx);
        return;
      }
      const desired = provisional[pos] ?? 0;
      const applied = Math.min(desired, cap);
      if (desired > cap) capped = true;
      shares[idx] += applied;
      remainingCaps[idx] -= applied;
      remaining -= applied;
      if (remainingCaps[idx] <= 0) active.delete(idx);
    });
    if (!capped) break;
  }
  return shares;
};
