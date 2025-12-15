"use client";
import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'secondary' | 'primary';
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

export function Badge({ 
  children, 
  className = '',
  style 
}: BadgeProps) {
  return (
    <span 
      className={className}
      style={style}
    >
      {children}
    </span>
  );
}
