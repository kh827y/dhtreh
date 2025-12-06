"use client";

import React from "react";
import { Crown, Clock, AlertTriangle } from "lucide-react";

type PortalSubscription = {
  status: string;
  planName: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  expiresSoon: boolean;
  expired: boolean;
};

interface HeaderPlanBadgeProps {
  subscription: PortalSubscription | null;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

export function HeaderPlanBadge({ subscription }: HeaderPlanBadgeProps) {
  if (!subscription) return null;
  
  const { planName, daysLeft, expiresSoon, expired, currentPeriodEnd } = subscription;
  
  const statusColor = expired 
    ? "var(--danger)" 
    : expiresSoon 
      ? "var(--warning)" 
      : "var(--success)";
  
  const bgColor = expired
    ? "rgba(239, 68, 68, 0.1)"
    : expiresSoon
      ? "rgba(245, 158, 11, 0.1)"
      : "rgba(16, 185, 129, 0.1)";
      
  const borderColor = expired
    ? "rgba(239, 68, 68, 0.3)"
    : expiresSoon
      ? "rgba(245, 158, 11, 0.3)"
      : "rgba(16, 185, 129, 0.3)";

  return (
    <div 
      className="header-plan-badge"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        borderRadius: "var(--radius-md)",
        background: bgColor,
        border: `1px solid ${borderColor}`,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Crown size={16} style={{ color: "var(--brand-primary-light)" }} />
        <span style={{ fontWeight: 600, color: "var(--fg)" }}>
          {planName || "Тариф"}
        </span>
      </div>
      
      <div style={{ 
        width: 1, 
        height: 20, 
        background: "var(--border-default)" 
      }} />
      
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {expired ? (
          <AlertTriangle size={14} style={{ color: statusColor }} />
        ) : (
          <Clock size={14} style={{ color: statusColor }} />
        )}
        <span style={{ color: statusColor, fontWeight: 600 }}>
          {expired 
            ? "Истёк"
            : daysLeft != null 
              ? `${daysLeft} дн.`
              : formatDateShort(currentPeriodEnd)
          }
        </span>
      </div>
    </div>
  );
}
