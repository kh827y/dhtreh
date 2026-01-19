"use client";

import { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & { label?: string };

export default function Input({ label, className = "", ...rest }: Props) {
  return (
    <label className="inline-flex flex-col gap-1">
      {label && <span className="text-xs text-[#7f8ea3]">{label}</span>}
      <input className={`h-10 px-3 rounded border border-[#1e2a44] bg-[#0e1629] text-[#e6edf3] placeholder-[#7f8ea3] ${className}`} {...rest} />
    </label>
  );
}
