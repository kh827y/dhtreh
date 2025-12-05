"use client";
import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'badge',
  success: 'badge badge-success',
  warning: 'badge badge-warning',
  danger: 'badge badge-danger',
  info: 'badge',
};

export function Badge({ 
  children, 
  variant = 'default', 
  size = 'md',
  icon,
  dot,
  className = '',
  style 
}: BadgeProps) {
  const sizeStyles: React.CSSProperties = size === 'sm' 
    ? { padding: '2px 8px', fontSize: 11 }
    : {};

  return (
    <span 
      className={`${variantClasses[variant]} ${className}`}
      style={{ ...sizeStyles, ...style }}
    >
      {dot && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'currentColor',
          marginRight: 4
        }} />
      )}
      {icon && <span style={{ display: 'flex', marginRight: 4 }}>{icon}</span>}
      {children}
    </span>
  );
}
