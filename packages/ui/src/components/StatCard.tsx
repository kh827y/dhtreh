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
  trend,
  loading,
  className = '',
  style,
}: StatCardProps) {
  return (
    <div 
      className={className}
      style={style}
    >
      <div>{title}</div>
      <div>{loading ? "..." : value}</div>
      {trend && !loading ? (
        <div>
          {trend.value}
          {trend.label ? ` (${trend.label})` : ""}
        </div>
      ) : null}
      {subtitle && !loading ? <div>{subtitle}</div> : null}
    </div>
  );
}
