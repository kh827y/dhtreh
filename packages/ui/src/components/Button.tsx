"use client";
import React, { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant: _variant, size: _size = 'md', leftIcon: _left, rightIcon: _right, startIcon: _start, endIcon: _end, className, children, style: _style, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
});
