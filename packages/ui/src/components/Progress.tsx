"use client";
import React from 'react';

export interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Progress({
  value,
  max = 100,
  size: _size = 'md',
  variant: _variant = 'default',
  showLabel,
  label,
  animated = true,
  className = '',
  style,
}: ProgressProps) {
  const safeMax = max || 1;
  const clampedValue = Math.min(Math.max(value, 0), safeMax);
  const percentage = Math.min(Math.max((clampedValue / safeMax) * 100, 0), 100);

  return (
    <div className={className} style={style}>
      {(label || showLabel) && (
        <div>
          {label}
          {showLabel ? ` ${Math.round(percentage)}%` : null}
        </div>
      )}
      <progress value={clampedValue} max={safeMax} />
    </div>
  );
}
