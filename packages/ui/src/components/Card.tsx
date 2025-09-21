"use client";
import React from 'react';

export function Card({ className = '', style, children }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>) {
  return (
    <div className={`card glass ${className}`} style={style}>{children}</div>
  );
}

export function CardHeader({ className = '', style, title, subtitle, actions }: { className?: string; style?: React.CSSProperties; title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={`card-header ${className}`} style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'space-between', ...(style||{}) }}>
      <div style={{ display:'grid', gap: 2 }}>
        {title && <div className="card-title">{title}</div>}
        {subtitle && <div className="card-muted">{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className = '', style, children }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>) {
  return (
    <div className={className} style={{ padding: 16, ...(style || {}) }}>{children}</div>
  );
}

export function CardFooter({ className = '', style, children }: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>) {
  return (
    <div className={className} style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', ...(style || {}) }}>{children}</div>
  );
}
