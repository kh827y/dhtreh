"use client";

import { SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { label?: string };

export default function Select({ label, className = "", children, ...rest }: Props) {
  return (
    <label className="inline-flex flex-col gap-1">
      {label && <span className="text-xs text-[#7f8ea3]">{label}</span>}
      <select className={`h-10 px-3 rounded border border-[#1e2a44] bg-[#0e1629] text-[#e6edf3] ${className}`} {...rest}>
        {children}
      </select>
    </label>
  );
}
