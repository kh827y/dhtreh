"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md";
  loading?: boolean;
  leftIcon?: ReactNode;
};

export default function Button({ variant = "primary", size = "md", loading, leftIcon, className = "", children, disabled, ...rest }: Props) {
  const base = "inline-flex items-center justify-center rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#3653a7] disabled:opacity-60 disabled:pointer-events-none";
  const sizes = size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm";
  const variants = variant === "primary"
    ? "bg-blue-600 hover:bg-blue-500 text-white"
    : variant === "secondary"
    ? "bg-[#111c31] hover:bg-[#16233d] text-[#cbd5e1] border border-[#1e2a44]"
    : "bg-transparent border border-[#1e2a44] text-[#cbd5e1] hover:bg-[#0f1a30]";
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <span className="mr-2 inline-block h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
      {!loading && leftIcon && <span className="mr-2 inline-flex items-center">{leftIcon}</span>}
      {children}
    </button>
  );
}
