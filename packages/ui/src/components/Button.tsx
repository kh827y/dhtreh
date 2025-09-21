"use client";
import React, { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const sizeClass = (s: Size) => {
  switch (s) {
    case 'sm': return { padding: '8px 12px', fontSize: 12 } as React.CSSProperties;
    case 'lg': return { padding: '12px 18px', fontSize: 16 } as React.CSSProperties;
    default: return { padding: '10px 14px', fontSize: 14 } as React.CSSProperties;
  }
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, className, style, children, ...rest },
  ref
) {
  const vClass = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : 'btn-ghost';
  return (
    <button
      ref={ref}
      className={`btn ${vClass} ${className ?? ''}`}
      style={{ ...sizeClass(size), ...(style || {}) }}
      {...rest}
    >
      {leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
});
