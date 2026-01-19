"use client";

import { ReactNode } from "react";

export default function KpiCard({ title, value, subtitle, delta, icon }: { title: string; value: string | number; subtitle?: string; delta?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1e2a44] bg-[#0e1629] p-4 flex items-center gap-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-[#111c31] text-[#89b4fa] flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm text-[#9fb0c9]">{title}</div>
        <div className="text-2xl font-semibold text-[#e6edf3] leading-tight">{value}</div>
        {subtitle && <div className="text-xs text-[#7f8ea3] mt-1">{subtitle}</div>}
      </div>
      {delta && (
        <div className={`text-sm font-medium ${delta.startsWith("-") ? "text-rose-400" : "text-emerald-400"}`}>{delta}</div>
      )}
    </div>
  );
}
