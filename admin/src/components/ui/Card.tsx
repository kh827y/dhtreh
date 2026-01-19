"use client";

import { ReactNode } from "react";

type Props = { title?: string; subtitle?: string; actions?: ReactNode; children?: ReactNode; className?: string };

export default function Card({ title, subtitle, actions, children, className = "" }: Props) {
  return (
    <div className={`rounded-xl border border-[#1e2a44] bg-[#0e1629] p-4 ${className}`}>
      {(title || actions || subtitle) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {title && <div className="text-lg font-semibold text-[#e6edf3]">{title}</div>}
            {subtitle && <div className="text-xs text-[#9fb0c9] mt-0.5">{subtitle}</div>}
          </div>
          {actions && <div className="ml-4">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
