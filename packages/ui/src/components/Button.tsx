"use client";
import React, { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  // aliases used in apps
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  children?: React.ReactNode;
}

const sizeClass = (s: Size) => {
  switch (s) {
    case 'sm': return { padding: '8px 12px', fontSize: 12 } as React.CSSProperties;
    case 'lg': return { padding: '12px 18px', fontSize: 16 } as React.CSSProperties;
    default: return { padding: '10px 14px', fontSize: 14 } as React.CSSProperties;
  }
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, startIcon, endIcon, className, style, children, ...rest },
  ref
) {
  // map aliases to canonical props and avoid leaking them to DOM
  const leading = leftIcon ?? startIcon ?? null;
  const trailing = rightIcon ?? endIcon ?? null;
  const vClass =
    variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
      ? 'btn-secondary'
      : variant === 'danger'
      ? 'btn-danger'
      : 'btn-ghost';
  return (
    <button
      ref={ref}
      className={`btn ${vClass} ${className ?? ''}`}
      style={{ ...sizeClass(size), ...(style || {}) }}
      {...rest}
    >
      {leading}
      <span>{children}</span>
      {trailing}
    </button>
  );
});
