"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Search,
  ChevronRight,
  Crown,
  Clock,
  Trophy,
  Ban,
  RefreshCcw,
  Cake,
  Gift,
  Timer,
  Users,
  MonitorSmartphone,
  Link2,
} from "lucide-react";
import type { SidebarSection } from "./SidebarNav";
import { sidebarIconMap } from "./SidebarNav";

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
  navSections: SidebarSection[];
}

type SearchResult = {
  label: string;
  type:
    | "Раздел"
    | "Настройка"
    | "Инструмент"
    | "График"
    | "KPI"
    | "Интеграция";
  href: string;
  icon: React.ReactNode;
};

// Header 1:1 как в new design/components/Header.tsx
export function AppHeader({ subscription, navSections }: AppHeaderProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);

  const typeColors: Record<SearchResult["type"], string> = {
    Раздел: "bg-purple-100 text-purple-600",
    Настройка: "bg-gray-100 text-gray-600",
    Инструмент: "bg-orange-50 text-orange-600",
    График: "bg-blue-50 text-blue-600",
    KPI: "bg-green-50 text-green-600",
    Интеграция: "bg-indigo-50 text-indigo-600",
  };

  // Иконки для дропдауна поиска — используем карту сайдбара и точечные иконки из new design
  const resolveIcon = React.useCallback((href: string): React.ReactNode => {
    const normalized = href.split("?")[0] ?? href;
    const icon = sidebarIconMap[href] || sidebarIconMap[normalized];
    if (React.isValidElement(icon)) {
      return React.cloneElement(icon as React.ReactElement, { size: 14, strokeWidth: 1.5 });
    }
    return <Search size={14} strokeWidth={1.5} />;
  }, []);

  const manualSearchIndex = React.useMemo<SearchResult[]>(
    () => [
      {
        label: "Уровни клиентов",
        type: "Настройка",
        href: "/loyalty/mechanics/levels",
        icon: <Trophy size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки бонусов",
        type: "Настройка",
        href: "/loyalty/mechanics/redeem-limits",
        icon: <Ban size={14} strokeWidth={1.5} />,
      },
      {
        label: "Автовозврат клиентов",
        type: "Настройка",
        href: "/loyalty/mechanics/auto-return",
        icon: <RefreshCcw size={14} strokeWidth={1.5} />,
      },
      {
        label: "Поздравления с днём рождения",
        type: "Настройка",
        href: "/loyalty/mechanics/birthday",
        icon: <Cake size={14} strokeWidth={1.5} />,
      },
      {
        label: "Баллы за регистрацию",
        type: "Настройка",
        href: "/loyalty/mechanics/registration-bonus",
        icon: <Gift size={14} strokeWidth={1.5} />,
      },
      {
        label: "Напоминание о сгорании",
        type: "Настройка",
        href: "/loyalty/mechanics/ttl",
        icon: <Timer size={14} strokeWidth={1.5} />,
      },
      {
        label: "Реферальная программа",
        type: "Настройка",
        href: "/referrals/program",
        icon: <Users size={14} strokeWidth={1.5} />,
      },
      {
        label: "REST API",
        type: "Интеграция",
        href: "/integrations/rest-api",
        icon: <Link2 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Telegram Miniapp",
        type: "Интеграция",
        href: "/integrations/telegram-mini-app",
        icon: <MonitorSmartphone size={14} strokeWidth={1.5} />,
      },
    ],
    [],
  );

  // Build search index from nav sections + ручные ссылки из new design
  const searchIndex = React.useMemo(() => {
    const out: SearchResult[] = [];
    const typeOverride: Record<string, SearchResult["type"]> = {
      "/customers/import": "Инструмент",
      "/settings/system": "Настройка",
      "/settings/outlets": "Настройка",
      "/settings/staff": "Настройка",
      "/settings/access": "Настройка",
      "/settings/telegram": "Настройка",
      "/settings/integrations": "Настройка",
      "/loyalty/mechanics": "Настройка",
      "/loyalty/mechanics/birthday": "Настройка",
      "/loyalty/mechanics/auto-return": "Настройка",
    };

    for (const section of navSections || []) {
      for (const item of section.items || []) {
        const normalized = item.href.split("?")[0] ?? item.href;
        out.push({
          label: item.label,
          type: typeOverride[normalized] || "Раздел",
          href: item.href,
          icon: resolveIcon(item.href),
        });
      }
    }

    for (const manual of manualSearchIndex) {
      const exists = out.some((item) => item.href === manual.href);
      if (!exists) out.push(manual);
    }
    return out;
  }, [manualSearchIndex, navSections, resolveIcon]);

  // Handle search
  React.useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setSearchResults([]);
      return;
    }
    const results = searchIndex.filter((item) =>
      item.label.toLowerCase().includes(query)
    );
    setSearchResults(results);
  }, [searchQuery, searchIndex]);

  // Click outside to close search
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = (href: string) => {
    router.push(href);
    setSearchQuery("");
    setIsSearchFocused(false);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/session/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  };

  const daysLeft = subscription?.daysLeft;

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-8 sticky top-0 z-20">
      {/* Search Bar */}
      <div className="flex items-center w-96 relative" ref={searchRef}>
        <div className="relative w-full overflow-hidden rounded-lg border border-gray-100 bg-gray-50 transition-colors focus-within:border-purple-500 focus-within:bg-white">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            className="block w-full h-10 pl-10 pr-3 py-2 bg-transparent border-none leading-5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0"
            placeholder="Поиск раздела, графика или настройки..."
          />
        </div>

        {/* Search Results Dropdown */}
        {isSearchFocused && searchQuery && (
          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-96 overflow-y-auto animate-fade-in z-50">
            {searchResults.length > 0 ? (
              <div className="py-2">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between">
                  <span>Результаты поиска</span>
                  <span>{searchResults.length}</span>
                </div>
                {searchResults.map((result) => (
                  <button
                    key={result.href}
                    type="button"
                    onClick={() => handleResultClick(result.href)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between group transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-1.5 rounded transition-colors ${
                          typeColors[result.type] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {result.icon}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-700">
                          {result.label}
                        </div>
                        <div className="text-xs text-gray-500">{result.type}</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 group-hover:text-purple-400" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Ничего не найдено</p>
                <p className="text-xs text-gray-400 mt-1">Попробуйте изменить запрос</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-4">
        {/* Subscription Info — 1:1 как в new design */}
        <div className="hidden md:flex items-center bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
          <div className="flex items-center space-x-1.5 mr-3 border-r border-purple-200 pr-3">
            <Crown size={14} className="text-purple-600 fill-current" />
            <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">
              {subscription?.planName || "Full"}
            </span>
          </div>
          <div
            className="flex items-center space-x-1.5 text-xs text-purple-700 font-medium"
            title="До окончания подписки"
          >
            <Clock size={14} />
            <span>{daysLeft != null ? `${daysLeft} дня` : "—"}</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center space-x-2 text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors group"
          title="Выйти из аккаунта"
        >
          <LogOut size={20} className="group-hover:stroke-red-600" />
          <span className="text-sm font-medium hidden lg:inline">Выйти</span>
        </button>
      </div>
    </header>
  );
}
