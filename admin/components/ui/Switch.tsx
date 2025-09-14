"use client";

import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLSpanElement> & { checked: boolean; onChange: (v: boolean)=>void; label?: string };

export default function Switch({ checked, onChange, label, className = "", ...rest }: Props) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`} {...rest}>
      {label && <span className="text-sm text-[#9fb0c9]">{label}</span>}
      <span onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors ${checked? 'bg-emerald-500' : 'bg-[#1e2a44]'} relative`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked? 'translate-x-4' : ''}`} />
      </span>
    </label>
  );
}
