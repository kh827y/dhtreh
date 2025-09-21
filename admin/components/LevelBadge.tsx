"use client";
import React from 'react';

export function LevelBadge({ levelName, earnBps, redeemBps, className }: { levelName?: string|null; earnBps?: number|null; redeemBps?: number|null; className?: string }) {
  if (!levelName) return null;
  const titleLines: string[] = [
    `Уровень: ${levelName}`,
  ];
  if (earnBps != null) titleLines.push(`Начисление: ${(earnBps/100).toFixed(2)}%`);
  if (redeemBps != null) titleLines.push(`Лимит списания: ${(redeemBps/100).toFixed(2)}%`);
  return (
    <span
      title={titleLines.join("\n")}
      className={className}
      style={{
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 999,
        background: '#1e293b',
        color: '#cbd5e1',
        fontSize: 11,
        border: '1px solid #334155',
        display: 'inline-block',
      }}
    >
      {levelName}
    </span>
  );
}
