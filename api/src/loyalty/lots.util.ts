export type Lot = { id: string; points: number; consumedPoints: number; earnedAt: Date };

export type LotUpdate = { id: string; deltaConsumed: number };

// FIFO consumption: earliest lots first
export function planConsume(lots: Lot[], amount: number): LotUpdate[] {
  let left = Math.max(0, Math.floor(amount || 0));
  const updates: LotUpdate[] = [];
  const ordered = [...lots].sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime());
  for (const lot of ordered) {
    if (left <= 0) break;
    const consumed = Math.max(0, lot.consumedPoints || 0);
    const remain = Math.max(0, (lot.points || 0) - consumed);
    if (remain <= 0) continue;
    const take = Math.min(remain, left);
    if (take > 0) {
      updates.push({ id: lot.id, deltaConsumed: take });
      left -= take;
    }
  }
  return updates;
}

// LIFO unconsume: latest consumed lots first (give back consumption)
export function planUnconsume(lots: Lot[], amount: number): LotUpdate[] {
  let left = Math.max(0, Math.floor(amount || 0));
  const updates: LotUpdate[] = [];
  const ordered = [...lots].sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime());
  for (const lot of ordered) {
    if (left <= 0) break;
    const consumed = Math.max(0, lot.consumedPoints || 0);
    if (consumed <= 0) continue;
    const give = Math.min(consumed, left);
    if (give > 0) {
      updates.push({ id: lot.id, deltaConsumed: -give });
      left -= give;
    }
  }
  return updates;
}

// LIFO revoke: latest lots first (reduce remaining points by marking them consumed)
export function planRevoke(lots: Lot[], amount: number): LotUpdate[] {
  let left = Math.max(0, Math.floor(amount || 0));
  const updates: LotUpdate[] = [];
  const ordered = [...lots].sort((a, b) => b.earnedAt.getTime() - a.earnedAt.getTime());
  for (const lot of ordered) {
    if (left <= 0) break;
    const consumed = Math.max(0, lot.consumedPoints || 0);
    const remain = Math.max(0, (lot.points || 0) - consumed);
    if (remain <= 0) continue;
    const take = Math.min(remain, left);
    if (take > 0) {
      updates.push({ id: lot.id, deltaConsumed: take });
      left -= take;
    }
  }
  return updates;
}

