"use client";
import React from 'react';

export interface CardProps extends React.PropsWithChildren {
  className?: string;
  style?: React.CSSProperties;
  hover?: boolean;
  glow?: boolean;
  variant?: 'default' | 'stat' | 'gradient';
}

export function Card({ className = '', style, children, hover, glow, variant = 'default' }: CardProps) {
  const variantClass = variant === 'stat' ? 'card-stat' : variant === 'gradient' ? 'border-gradient' : '';
  const hoverClass = hover ? 'card-hover' : '';
  const glowClass = glow ? 'glow-primary' : '';
  return (
    <div 
      className={`card ${variantClass} ${hoverClass} ${glowClass} ${className}`.trim()} 
      style={style}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  className?: string;
  style?: React.CSSProperties;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}

export function CardHeader({ className = '', style, title, subtitle, actions, icon }: CardHeaderProps) {
  return (
    <div 
      className={`card-header ${className}`} 
      style={{ 
        padding: '16px 20px', 
        borderBottom: '1px solid var(--border-subtle)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: 12,
        ...(style || {}) 
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        {icon && (
          <div style={{ 
            width: 40, 
            height: 40, 
            borderRadius: 'var(--radius-md)', 
            background: 'rgba(99, 102, 241, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-primary-light)',
            flexShrink: 0
          }}>
            {icon}
          </div>
        )}
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          {title && <div className="card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>}
          {subtitle && <div className="card-muted">{subtitle}</div>}
        </div>
      </div>
      {actions}
    </div>
  );
}

export interface CardBodyProps extends React.PropsWithChildren {
  className?: string;
  style?: React.CSSProperties;
}

export function CardBody({ className = '', style, children }: CardBodyProps) {
  return (
    <div className={className} style={{ padding: 20, ...(style || {}) }}>{children}</div>
  );
}

export interface CardFooterProps extends React.PropsWithChildren {
  className?: string;
  style?: React.CSSProperties;
}

export function CardFooter({ className = '', style, children }: CardFooterProps) {
  return (
    <div 
      className={className} 
      style={{ 
        padding: '14px 20px', 
        borderTop: '1px solid var(--border-subtle)', 
        background: 'rgba(0, 0, 0, 0.2)',
        ...(style || {}) 
      }}
    >
      {children}
    </div>
  );
}
