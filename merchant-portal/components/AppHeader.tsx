"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Search,
  ChevronRight,
  Crown,
  Clock,
  AlertTriangle,
  BarChart3,
  PieChart,
  CreditCard,
  UserPlus,
  TrendingUp,
  Coins,
  ShoppingBag,
  Activity,
  Grid,
  List,
  Store,
  Award,
  BadgeCheck,
  Share2,
  Code,
  Trophy,
  Ban,
  RefreshCcw,
  Cake,
  Timer,
  Users,
  MonitorSmartphone,
} from "lucide-react";
import type { SidebarSection } from "./SidebarNav";
import { sidebarIconMap } from "./SidebarNav";

type PortalSubscription = {
  status: string;
  planId: string | null;
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
    | "Таблица"
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
    Таблица: "bg-orange-50 text-orange-600",
    Интеграция: "bg-indigo-50 text-indigo-600",
  };

  // Иконки для дропдауна поиска — используем карту сайдбара и точечные иконки из new design
  const resolveIcon = React.useCallback((href: string): React.ReactNode => {
    const normalized = href.split("?")[0] ?? href;
    const icon = sidebarIconMap[href] || sidebarIconMap[normalized];
    if (React.isValidElement(icon)) {
      return React.cloneElement(icon as React.ReactElement<any>, { size: 14, strokeWidth: 1.5 });
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
        label: "Настройки бонусов за покупки",
        type: "Настройка",
        href: "/loyalty/mechanics/bonus-settings",
        icon: <Ban size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки автовозврата",
        type: "Настройка",
        href: "/loyalty/mechanics/auto-return",
        icon: <RefreshCcw size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки поздравлений",
        type: "Настройка",
        href: "/loyalty/mechanics/birthday",
        icon: <Cake size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки регистрации",
        type: "Настройка",
        href: "/loyalty/mechanics/registration-bonus",
        icon: <UserPlus size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки сгорания",
        type: "Настройка",
        href: "/loyalty/mechanics/ttl",
        icon: <Timer size={14} strokeWidth={1.5} />,
      },
      {
        label: "Настройки реферальной",
        type: "Настройка",
        href: "/referrals/program",
        icon: <Share2 size={14} strokeWidth={1.5} />,
      },
      {
        label: "REST API",
        type: "Интеграция",
        href: "/integrations/rest-api",
        icon: <Code size={14} strokeWidth={1.5} />,
      },
      {
        label: "Telegram Miniapp",
        type: "Интеграция",
        href: "/integrations/telegram-mini-app",
        icon: <MonitorSmartphone size={14} strokeWidth={1.5} />,
      },
      {
        label: "Выручка (KPI)",
        type: "KPI",
        href: "/analytics",
        icon: <CreditCard size={14} strokeWidth={1.5} />,
      },
      {
        label: "Регистрации (KPI)",
        type: "KPI",
        href: "/analytics",
        icon: <UserPlus size={14} strokeWidth={1.5} />,
      },
      {
        label: "Средний чек (KPI)",
        type: "KPI",
        href: "/analytics",
        icon: <TrendingUp size={14} strokeWidth={1.5} />,
      },
      {
        label: "Списано баллов (KPI)",
        type: "KPI",
        href: "/analytics",
        icon: <Coins size={14} strokeWidth={1.5} />,
      },
      {
        label: "Динамика выручки",
        type: "График",
        href: "/analytics",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Структура продаж",
        type: "График",
        href: "/analytics",
        icon: <PieChart size={14} strokeWidth={1.5} />,
      },
      {
        label: "Покупок на клиента",
        type: "KPI",
        href: "/analytics",
        icon: <ShoppingBag size={14} strokeWidth={1.5} />,
      },
      {
        label: "Частота визитов",
        type: "KPI",
        href: "/analytics",
        icon: <Clock size={14} strokeWidth={1.5} />,
      },
      {
        label: "Активная база",
        type: "KPI",
        href: "/analytics",
        icon: <Activity size={14} strokeWidth={1.5} />,
      },
      {
        label: "Время с последней покупки",
        type: "График",
        href: "/analytics/time",
        icon: <Clock size={14} strokeWidth={1.5} />,
      },
      {
        label: "Активность клиентов",
        type: "График",
        href: "/analytics/time",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Тепловая карта",
        type: "График",
        href: "/analytics/time",
        icon: <Grid size={14} strokeWidth={1.5} />,
      },
      {
        label: "Распределение по полу",
        type: "График",
        href: "/analytics/portrait",
        icon: <PieChart size={14} strokeWidth={1.5} />,
      },
      {
        label: "Сравнение по полу",
        type: "График",
        href: "/analytics/portrait",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Аналитика по возрасту",
        type: "График",
        href: "/analytics/portrait",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Детальная демография",
        type: "График",
        href: "/analytics/portrait",
        icon: <Users size={14} strokeWidth={1.5} />,
      },
      {
        label: "Частота покупок",
        type: "График",
        href: "/analytics/repeat",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Уникальные покупатели",
        type: "KPI",
        href: "/analytics/repeat",
        icon: <Users size={14} strokeWidth={1.5} />,
      },
      {
        label: "Динамика среднего чека",
        type: "График",
        href: "/analytics/dynamics",
        icon: <TrendingUp size={14} strokeWidth={1.5} />,
      },
      {
        label: "Экономика баллов",
        type: "График",
        href: "/analytics/dynamics",
        icon: <Coins size={14} strokeWidth={1.5} />,
      },
      {
        label: "Движение баллов",
        type: "График",
        href: "/analytics/dynamics",
        icon: <BarChart3 size={14} strokeWidth={1.5} />,
      },
      {
        label: "Распределение RFM групп",
        type: "График",
        href: "/analytics/rfm",
        icon: <Grid size={14} strokeWidth={1.5} />,
      },
      {
        label: "Детальные комбинации",
        type: "Таблица",
        href: "/analytics/rfm",
        icon: <List size={14} strokeWidth={1.5} />,
      },
      {
        label: "Лидер по выручке",
        type: "KPI",
        href: "/analytics/outlets",
        icon: <Trophy size={14} strokeWidth={1.5} />,
      },
      {
        label: "Лидер роста",
        type: "KPI",
        href: "/analytics/outlets",
        icon: <TrendingUp size={14} strokeWidth={1.5} />,
      },
      {
        label: "Макс. трафик",
        type: "KPI",
        href: "/analytics/outlets",
        icon: <Store size={14} strokeWidth={1.5} />,
      },
      {
        label: "Эффективность точек",
        type: "Таблица",
        href: "/analytics/outlets",
        icon: <List size={14} strokeWidth={1.5} />,
      },
      {
        label: "Лучший сотрудник",
        type: "KPI",
        href: "/analytics/staff",
        icon: <Award size={14} strokeWidth={1.5} />,
      },
      {
        label: "Лучший продавец",
        type: "KPI",
        href: "/analytics/staff",
        icon: <BadgeCheck size={14} strokeWidth={1.5} />,
      },
      {
        label: "Лидер привлечения",
        type: "KPI",
        href: "/analytics/staff",
        icon: <UserPlus size={14} strokeWidth={1.5} />,
      },
      {
        label: "Детальная эффективность",
        type: "Таблица",
        href: "/analytics/staff",
        icon: <List size={14} strokeWidth={1.5} />,
      },
      {
        label: "Динамика привлечения",
        type: "График",
        href: "/analytics/referrals",
        icon: <TrendingUp size={14} strokeWidth={1.5} />,
      },
      {
        label: "Топ амбассадоров",
        type: "Таблица",
        href: "/analytics/referrals",
        icon: <Crown size={14} strokeWidth={1.5} />,
      },
    ],
    [],
  );

  // Build search index from nav sections + ручные ссылки из new design
  const searchIndex = React.useMemo(() => {
    const out: SearchResult[] = [];

    for (const section of navSections || []) {
      for (const item of section.items || []) {
        out.push({
          label: item.label,
          type: "Раздел",
          href: item.href,
          icon: resolveIcon(item.href),
        });
      }
    }

    for (const manual of manualSearchIndex) {
      const exists = out.some(
        (item) => item.href === manual.href && item.label === manual.label
      );
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

  const formatDaysLeft = (value: number) => {
    const abs = Math.abs(value);
    const mod100 = abs % 100;
    const mod10 = abs % 10;
    if (mod100 >= 11 && mod100 <= 14) return `${value} дней`;
    if (mod10 === 1) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4) return `${value} дня`;
    return `${value} дней`;
  };

  const daysLeft = subscription?.daysLeft;
  const showExpiryNotice = Boolean(subscription?.expiresSoon && !subscription?.expired);
  const planLabel = subscription?.planName || subscription?.planId || "Full";

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
          <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden max-h-96 overflow-y-auto  z-50">
            {searchResults.length > 0 ? (
              <div className="py-2">
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider flex justify-between">
                  <span>Результаты поиска</span>
                  <span>{searchResults.length}</span>
                </div>
                {searchResults.map((result) => (
                  <button
                    key={`${result.href}::${result.label}::${result.type}`}
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
        {showExpiryNotice && (
          <div className="hidden md:flex items-center bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-1.5 text-xs font-semibold">
            <AlertTriangle size={14} className="mr-2 text-amber-600" />
            <span>Подписка скоро истекает</span>
            <span className="ml-2 text-amber-700">
              {daysLeft != null ? `${daysLeft} дн.` : "скоро"}
            </span>
          </div>
        )}
        {/* Subscription Info — 1:1 как в new design */}
        <div className="hidden md:flex items-center bg-purple-50 rounded-lg px-3 py-1.5 border border-purple-100">
          <div className="flex items-center space-x-1.5 mr-3 border-r border-purple-200 pr-3">
            <Crown size={14} className="text-purple-600 fill-current" />
            <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">
              {planLabel}
            </span>
          </div>
          <div
            className="flex items-center space-x-1.5 text-xs text-purple-700 font-medium"
            title="До окончания подписки"
          >
            <Clock size={14} />
            <span>{daysLeft != null ? formatDaysLeft(daysLeft) : "—"}</span>
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
