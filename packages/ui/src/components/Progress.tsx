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

const sizeHeight: Record<string, number> = {
  sm: 4,
  md: 8,
  lg: 12,
};

const variantGradients: Record<string, string> = {
  default: 'var(--brand-gradient)',
  success: 'linear-gradient(90deg, #10b981, #34d399)',
  warning: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
  danger: 'linear-gradient(90deg, #ef4444, #f87171)',
};

export function Progress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel,
  label,
  animated = true,
  className = '',
  style,
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const height = sizeHeight[size];

  return (
    <div className={className} style={{ width: '100%', ...style }}>
      {(showLabel || label) && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: 6,
          fontSize: 13,
          color: 'var(--fg-secondary)'
        }}>
          <span>{label}</span>
          {showLabel && <span style={{ fontWeight: 600 }}>{Math.round(percentage)}%</span>}
        </div>
      )}
      <div 
        className="progress-bar"
        style={{ height }}
      >
        <div 
          className="progress-bar-fill"
          style={{ 
            width: `${percentage}%`,
            background: variantGradients[variant],
            transition: animated ? 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
          }}
        />
      </div>
    </div>
  );
}
