import type { LevelsResp } from "./api";

export type LevelInfo = LevelsResp;

export function getProgressPercent(levelInfo: LevelInfo | null): number {
  if (!levelInfo) return 0;
  if (!levelInfo.next) return 100;
  const currentThreshold = levelInfo.current?.threshold || 0;
  const distance = Math.max(1, levelInfo.next.threshold - currentThreshold);
  const progress = Math.max(0, levelInfo.value - currentThreshold);
  return Math.max(0, Math.min(100, Math.round((progress / distance) * 100)));
}
