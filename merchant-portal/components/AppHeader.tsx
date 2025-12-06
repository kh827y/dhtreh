"use client";

import React from "react";
import { ThemeToggle } from "./ThemeToggle";
import { HeaderPlanBadge } from "./HeaderPlanBadge";
import { LogOut, Settings } from "lucide-react";

type PortalSubscription = {
  status: string;
  planName: string | null;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  expiresSoon: boolean;
  expired: boolean;
};

interface AppHeaderProps {
  staffLabel: string | null;
  role: string | null;
  subscription: PortalSubscription | null;
}

export function AppHeader({ staffLabel, role, subscription }: AppHeaderProps) {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  return (
    <header className="app-header">
      <div className="header-content">
        {/* Brand */}
        <div className="header-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">Loyalty</span>
            <span className="brand-label">Business</span>
          </div>
        </div>
        
        {/* Center - Plan Info */}
        <div className="header-center">
          <HeaderPlanBadge subscription={subscription} />
        </div>
        
        {/* Actions */}
        <div className="header-actions">
          {/* Theme Toggle */}
          <ThemeToggle />
          
          {/* User Info */}
          {staffLabel && (
            <div className="user-info">
              <div className="user-avatar">
                {staffLabel.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <span className="user-name">{staffLabel}</span>
                {role && <span className="user-role">{role}</span>}
              </div>
            </div>
          )}
          
          {/* Logout */}
          <button
            onClick={handleLogout}
            className="header-icon-btn"
            title="Выйти"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              color: "var(--danger-light)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
