"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Clock,
  Users,
  Repeat,
  TrendingUp,
  Grid3X3,
  Store,
  UserCheck,
  Gift,
  Sparkles,
  Zap,
  BookOpen,
  Bell,
  Send,
  Ticket,
  Award,
  Shield,
  Monitor,
  MessageSquare,
  UsersRound,
  Target,
  Package,
  FolderTree,
  Wallet,
  MapPin,
  UserCog,
  Lock,
  Plug,
  Settings,
  Upload,
  ChevronDown,
  ChevronRight,
  Cake,
  RotateCcw,
} from "lucide-react";

type SectionItem = {
  href: string;
  label: string;
  icon?: React.ReactNode;
};

export type SidebarSection = {
  id: string;
  title: string;
  icon?: React.ReactNode;
  items: SectionItem[];
};

type SidebarNavProps = {
  sections: SidebarSection[];
};

const iconMap: Record<string, React.ReactNode> = {
  "/": <LayoutDashboard size={18} />,
  "/analytics": <BarChart3 size={18} />,
  "/analytics/time": <Clock size={18} />,
  "/analytics/portrait": <Users size={18} />,
  "/analytics/repeat": <Repeat size={18} />,
  "/analytics/dynamics": <TrendingUp size={18} />,
  "/analytics/rfm": <Grid3X3 size={18} />,
  "/analytics/outlets": <Store size={18} />,
  "/analytics/staff": <UserCheck size={18} />,
  "/analytics/referrals": <Gift size={18} />,
  "/loyalty/mechanics/birthday?tab=stats": <Cake size={18} />,
  "/loyalty/mechanics/auto-return?tab=stats": <RotateCcw size={18} />,
  "/loyalty/mechanics": <Sparkles size={18} />,
  "/loyalty/actions": <Zap size={18} />,
  "/loyalty/actions-earn": <Award size={18} />,
  "/operations": <BookOpen size={18} />,
  "/loyalty/push": <Bell size={18} />,
  "/loyalty/telegram": <Send size={18} />,
  "/promocodes": <Ticket size={18} />,
  "/loyalty/staff-motivation": <Award size={18} />,
  "/loyalty/antifraud": <Shield size={18} />,
  "/loyalty/cashier": <Monitor size={18} />,
  "/reviews": <MessageSquare size={18} />,
  "/customers": <UsersRound size={18} />,
  "/audiences": <Target size={18} />,
  "/products": <Package size={18} />,
  "/categories": <FolderTree size={18} />,
  "/wallet": <Wallet size={18} />,
  "/settings/outlets": <MapPin size={18} />,
  "/settings/staff": <UserCog size={18} />,
  "/settings/access": <Lock size={18} />,
  "/settings/integrations": <Plug size={18} />,
  "/settings/telegram": <Send size={18} />,
  "/settings/system": <Settings size={18} />,
  "/customers/import": <Upload size={18} />,
};

const sectionIcons: Record<string, React.ReactNode> = {
  wizard: <LayoutDashboard size={18} />,
  analytics: <BarChart3 size={18} />,
  loyalty: <Sparkles size={18} />,
  reviews: <MessageSquare size={18} />,
  customers: <UsersRound size={18} />,
  catalog: <Package size={18} />,
  wallet: <Wallet size={18} />,
  settings: <Settings size={18} />,
  tools: <Upload size={18} />,
};

function LinkItem({ href, label, isActive }: SectionItem & { isActive: boolean }) {
  const icon = iconMap[href] || iconMap[href.split("?")[0] ?? ""];
  
  return (
    <a
      href={href}
      style={{
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: "var(--radius-md)",
        fontSize: 14,
        fontWeight: isActive ? 600 : 400,
        color: isActive ? "var(--fg)" : "var(--fg-secondary)",
        background: isActive 
          ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))"
          : "transparent",
        border: isActive 
          ? "1px solid rgba(99, 102, 241, 0.3)"
          : "1px solid transparent",
        transition: "all 0.2s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
          e.currentTarget.style.borderColor = "var(--border-subtle)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "transparent";
        }
      }}
    >
      {isActive && (
        <span style={{
          position: "absolute",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          width: 3,
          height: 20,
          borderRadius: "0 4px 4px 0",
          background: "var(--brand-gradient)",
        }} />
      )}
      <span style={{ 
        color: isActive ? "var(--brand-primary-light)" : "var(--fg-muted)",
        display: "flex",
        alignItems: "center",
        transition: "color 0.2s ease"
      }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </a>
  );
}

export default function SidebarNav({ sections }: SidebarNavProps) {
  const pathname = usePathname();
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    sections.forEach((section) => {
      // Open section if it contains the current path
      const hasActiveItem = section.items.some(item => 
        pathname === item.href || pathname === item.href.split("?")[0]
      );
      initialState[section.id] = hasActiveItem || section.id === "wizard";
    });
    return initialState;
  });

  const toggleSection = React.useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <nav style={{ display: "grid", gap: 4 }}>
      {sections.map((section) => {
        const isOpen = openSections[section.id];
        const sectionIcon = sectionIcons[section.id];
        
        return (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--fg-muted)",
                background: "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                e.currentTarget.style.color = "var(--fg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--fg-muted)";
              }}
            >
              {sectionIcon && (
                <span style={{ opacity: 0.7 }}>{sectionIcon}</span>
              )}
              <span style={{ flex: 1, textAlign: "left" }}>{section.title}</span>
              <span style={{ 
                transition: "transform 0.2s ease",
                transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)"
              }}>
                <ChevronDown size={14} />
              </span>
            </button>
            
            <div style={{
              display: "grid",
              gap: 2,
              marginTop: isOpen ? 4 : 0,
              marginLeft: 4,
              paddingLeft: 12,
              borderLeft: "1px solid var(--border-subtle)",
              maxHeight: isOpen ? 1000 : 0,
              overflow: "hidden",
              opacity: isOpen ? 1 : 0,
              transition: "all 0.3s ease",
            }}>
              {section.items.map((item) => {
                const normalizedHref = item.href.split("?")[0];
                const isActive = pathname === item.href || pathname === normalizedHref;
                return (
                  <LinkItem 
                    key={item.href} 
                    {...item} 
                    isActive={isActive}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
