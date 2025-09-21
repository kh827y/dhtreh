"use client";
import { motion } from 'framer-motion';
import React from 'react';

export function MotionFadeIn({ children, delay = 0, duration = 0.4, className, style }: React.PropsWithChildren<{ delay?: number; duration?: number; className?: string; style?: React.CSSProperties }>) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
