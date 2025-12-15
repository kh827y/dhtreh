"use client";
import React from 'react';

export function MotionFadeIn({ children, delay: _delay = 0, duration: _duration = 0.4, className, style }: React.PropsWithChildren<{ delay?: number; duration?: number; className?: string; style?: React.CSSProperties }>) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
