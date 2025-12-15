"use client";
import React from 'react';

export function Skeleton({ width, height, className = '', style }: { width?: number|string; height?: number|string; className?: string; style?: React.CSSProperties }) {
  const mergedStyle: React.CSSProperties = { ...(style || {}) };
  if (width !== undefined) mergedStyle.width = width;
  if (height !== undefined) mergedStyle.height = height;
  return <div className={className} style={mergedStyle} />;
}
