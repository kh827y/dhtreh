"use client";
import React from 'react';

export interface CardProps {
  className?: string;
  style?: React.CSSProperties;
  hover?: boolean;
  glow?: boolean;
  variant?: 'default' | 'stat' | 'gradient';
  children?: React.ReactNode;
  id?: string;
}

export function Card({ className = '', style, children, id }: CardProps) {
  return (
    <div 
      id={id}
      className={className}
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

export function CardHeader({ className = '', style, title, subtitle, actions }: CardHeaderProps) {
  return (
    <div className={className} style={style}>
      <div>
        {title}
        {subtitle ? <div>{subtitle}</div> : null}
      </div>
      {actions}
    </div>
  );
}

export interface CardBodyProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function CardBody({ className = '', style, children }: CardBodyProps) {
  return (
    <div className={className} style={style}>{children}</div>
  );
}

export interface CardFooterProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function CardFooter({ className = '', style, children }: CardFooterProps) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
