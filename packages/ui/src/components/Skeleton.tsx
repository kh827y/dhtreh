"use client";
import React from 'react';

export function Skeleton({ width = '100%', height = 12, className = '', style }: { width?: number|string; height?: number|string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`skeleton ${className}`} style={{ width, height, ...(style || {}) }} />
  );
}
