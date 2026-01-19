"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Settings,
  BarChart3,
  Clock,
  UserCircle2,
  RefreshCcw,
  TrendingUp,
  Target,
  Store,
  BadgeCheck,
  Share2,
  Cake,
  RefreshCw,
  Sliders,
  Tag,
  Coins,
  Ticket,
  Award,
  MonitorSmartphone,
  ShieldAlert,
  ClipboardList,
  Bell,
  Send,
  MessageSquare,
  Users,
  Filter,
  ShoppingBag,
  Layers,
  Globe,
  UserCog,
  Shield,
  Link2,
  Upload,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type SectionItem = {
  href: string;
  label: string;
};

export type SidebarSection = {
  id: string;
  title: string;
  items: SectionItem[];
};

type SidebarNavProps = {
  sections: SidebarSection[];
};

// Иконки для каждого пункта меню — строго 1:1 с new design/components/Sidebar.tsx
export const sidebarIconMap: Record<string, React.ReactNode> = {
  "/": <Settings size={18} strokeWidth={1.5} />,
  "/analytics": <BarChart3 size={18} strokeWidth={1.5} />,
  "/analytics/time": <Clock size={18} strokeWidth={1.5} />,
  "/analytics/portrait": <UserCircle2 size={18} strokeWidth={1.5} />,
  "/analytics/repeat": <RefreshCcw size={18} strokeWidth={1.5} />,
  "/analytics/dynamics": <TrendingUp size={18} strokeWidth={1.5} />,
  "/analytics/rfm": <Target size={18} strokeWidth={1.5} />,
  "/analytics/outlets": <Store size={18} strokeWidth={1.5} />,
  "/analytics/staff": <BadgeCheck size={18} strokeWidth={1.5} />,
  "/analytics/referrals": <Share2 size={18} strokeWidth={1.5} />,
  "/loyalty/mechanics/birthday?tab=stats": <Cake size={18} strokeWidth={1.5} />,
  "/loyalty/mechanics/auto-return?tab=stats": <RefreshCw size={18} strokeWidth={1.5} />,
  "/loyalty/mechanics": <Sliders size={18} strokeWidth={1.5} />,
  "/loyalty/mechanics/": <Sliders size={18} strokeWidth={1.5} />,
  "/loyalty/actions": <Tag size={18} strokeWidth={1.5} />,
  "/loyalty/actions-earn": <Coins size={18} strokeWidth={1.5} />,
  "/promocodes": <Ticket size={18} strokeWidth={1.5} />,
  "/loyalty/staff-motivation": <Award size={18} strokeWidth={1.5} />,
  "/loyalty/cashier": <MonitorSmartphone size={18} strokeWidth={1.5} />,
  "/loyalty/antifraud": <ShieldAlert size={18} strokeWidth={1.5} />,
  "/operations": <ClipboardList size={18} strokeWidth={1.5} />,
  "/loyalty/push": <Bell size={18} strokeWidth={1.5} />,
  "/loyalty/telegram": <Send size={18} strokeWidth={1.5} />,
  "/reviews": <MessageSquare size={18} strokeWidth={1.5} />,
  "/reviews/": <MessageSquare size={18} strokeWidth={1.5} />,
  "/customers": <Users size={18} strokeWidth={1.5} />,
  "/audiences": <Filter size={18} strokeWidth={1.5} />,
  "/audiences/": <Filter size={18} strokeWidth={1.5} />,
  "/products": <ShoppingBag size={18} strokeWidth={1.5} />,
  "/categories": <Layers size={18} strokeWidth={1.5} />,
  "/settings/system": <Globe size={18} strokeWidth={1.5} />,
  "/settings/outlets": <Store size={18} strokeWidth={1.5} />,
  "/settings/outlets/": <Store size={18} strokeWidth={1.5} />,
  "/outlets": <Store size={18} strokeWidth={1.5} />,
  "/settings/staff": <UserCog size={18} strokeWidth={1.5} />,
  "/settings/access": <Shield size={18} strokeWidth={1.5} />,
  "/settings/telegram": <Send size={18} strokeWidth={1.5} />,
  "/settings/integrations": <Link2 size={18} strokeWidth={1.5} />,
  "/customers/import": <Upload size={18} strokeWidth={1.5} />,
};

function NavItem({ href, label, isActive }: SectionItem & { isActive: boolean }) {
  const icon = sidebarIconMap[href] || sidebarIconMap[href.split("?")[0] ?? ""];

  return (
    <Link
      href={href}
      className={`w-full flex items-center space-x-3 px-2 py-2 rounded-lg text-sm transition-colors duration-200 text-left ${
        isActive
          ? "bg-purple-50 text-purple-700 font-medium"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <span className={`flex-shrink-0 ${isActive ? "text-purple-600" : "text-gray-400"}`}>
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
    </Link>
  );
}

export default function SidebarNav({ sections }: SidebarNavProps) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = React.useState<string[]>([]);

  // Auto-expand section containing active item
  React.useEffect(() => {
    const activeGroup = sections.find((section) =>
      section.items.some((item) => {
        const normalizedHref = item.href.split("?")[0];
        return pathname === item.href || pathname === normalizedHref;
      })
    );

    if (activeGroup) {
      setExpandedSections((prev) => {
        if (!prev.includes(activeGroup.title)) {
          return [...prev, activeGroup.title];
        }
        return prev;
      });
    }
  }, [pathname, sections]);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  return (
    <nav className="flex-1 px-4 pb-6 space-y-2">
      {sections.map((section) => {
        const isExpanded = expandedSections.includes(section.title);
        const isActiveGroup = section.items.some((item) => {
          const normalizedHref = item.href.split("?")[0];
          return pathname === item.href || pathname === normalizedHref;
        });

        return (
          <div key={section.id} className="border-b border-gray-50 last:border-0 pb-2">
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              className={`w-full flex items-center justify-between px-2 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                isActiveGroup ? "text-purple-600" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span>{section.title}</span>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {isExpanded && (
              <ul className="space-y-1 mt-1">
                {section.items.map((item) => {
                  const normalizedHref = item.href.split("?")[0];
                  const isActive = pathname === item.href || pathname === normalizedHref;
                  return (
                    <li key={item.href}>
                      <NavItem {...item} isActive={isActive} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
