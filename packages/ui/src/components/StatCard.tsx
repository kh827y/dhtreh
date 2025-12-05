"use client";
import React from 'react';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  loading,
  className = '',
  style,
}: StatCardProps) {
  const trendColor = trend 
    ? trend.value > 0 
      ? 'var(--success-light)' 
      : trend.value < 0 
        ? 'var(--danger-light)' 
        : 'var(--fg-muted)'
    : undefined;

  return (
    <div 
      className={`card card-stat ${className}`}
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ 
          fontSize: 13, 
          color: 'var(--fg-muted)', 
          fontWeight: 500,
          letterSpacing: '0.01em'
        }}>
          {title}
        </span>
        {icon && (
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-primary-light)',
          }}>
            {icon}
          </div>
        )}
      </div>

      <div>
        {loading ? (
          <div className="skeleton" style={{ height: 32, width: '60%' }} />
        ) : (
          <div style={{ 
            fontSize: 28, 
            fontWeight: 700, 
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}>
            {value}
          </div>
        )}
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {trend && !loading && (
            <span style={{ 
              fontSize: 13, 
              fontWeight: 600,
              color: trendColor,
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}>
              {trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : ''}
              {Math.abs(trend.value)}%
              {trend.label && (
                <span style={{ color: 'var(--fg-dim)', fontWeight: 400, marginLeft: 4 }}>
                  {trend.label}
                </span>
              )}
            </span>
          )}
          {subtitle && !loading && (
            <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
