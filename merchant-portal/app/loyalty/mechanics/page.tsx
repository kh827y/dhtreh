"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Ban,
  RefreshCw,
  Cake,
  UserPlus,
  Hourglass,
  Share2,
  ChevronRight,
  Settings,
  Power,
} from "lucide-react";

type MechanicCard = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  toggle?: boolean;
  color?: string;
};

const cards: MechanicCard[] = [
  {
    id: "levels",
    title: "Уровни клиентов",
    description: "Ступени программы и условия перехода между уровнями",
    icon: <Trophy size={28} />,
    href: "/loyalty/mechanics/levels",
    color: "bg-yellow-50 text-yellow-600",
  },
  {
    id: "redeem-limits",
    title: "Настройки бонусов",
    description: "Срок жизни, запреты и задержки начисления баллов",
    icon: <Ban size={28} />,
    href: "/loyalty/mechanics/redeem-limits",
    color: "bg-red-50 text-red-600",
  },
  {
    id: "auto-return",
    title: "Автовозврат клиентов",
    description: "Возвращаем неактивных клиентов подарочными баллами",
    icon: <RefreshCw size={24} />,
    href: "/loyalty/mechanics/auto-return",
    toggle: true,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "birthday",
    title: "Поздравление с днём рождения",
    description: "Автопоздравления и подарочные баллы к празднику",
    icon: <Cake size={24} />,
    href: "/loyalty/mechanics/birthday",
    toggle: true,
    color: "bg-pink-50 text-pink-600",
  },
  {
    id: "registration-bonus",
    title: "Баллы за регистрацию",
    description: "Приветственный бонус новым участникам программы",
    icon: <UserPlus size={24} />,
    href: "/loyalty/mechanics/registration-bonus",
    toggle: true,
    color: "bg-green-50 text-green-600",
  },
  {
    id: "ttl",
    title: "Напоминание о сгорании",
    description: "Предупреждение клиентов о скором сгорании баллов",
    icon: <Hourglass size={24} />,
    href: "/loyalty/mechanics/ttl",
    toggle: true,
    color: "bg-amber-50 text-amber-600",
  },
  {
    id: "referral",
    title: "Реферальная программа",
    description: "Вознаграждение за приглашение новых клиентов",
    icon: <Share2 size={24} />,
    href: "/referrals/program",
    toggle: true,
    color: "bg-purple-50 text-purple-600",
  },
];

export default function MechanicsPage() {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({});
  const [settings, setSettings] = React.useState<Record<string, any>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string>("");
  const [tiersCount, setTiersCount] = React.useState<number | null>(null);

  const loadAll = React.useCallback(async () => {
    setError("");
    try {
      const tiersPromise = fetch("/api/portal/loyalty/tiers", { cache: "no-store" })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.message || "Не удалось загрузить уровни");
          const items = Array.isArray(json) ? json : Array.isArray((json as any)?.items) ? (json as any).items : [];
          return Array.isArray(items) ? items.length : null;
        })
        .catch(() => null);

      const endpoints: Record<string, string> = {
        "auto-return": "/api/portal/loyalty/auto-return",
        birthday: "/api/portal/loyalty/birthday",
        "registration-bonus": "/api/portal/loyalty/registration-bonus",
        ttl: "/api/portal/loyalty/ttl",
        referral: "/api/portal/referrals/program",
      };
      const ids = Object.keys(endpoints);
      const responses = await Promise.all(
        ids.map(async (id) => {
          const endpoint = endpoints[id];
          if (!endpoint) throw new Error(`Unknown endpoint: ${id}`);
          const res = await fetch(endpoint);
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(json?.message || `Не удалось загрузить ${id}`);
          return { id, json } as const;
        })
      );
      const nextEnabled: Record<string, boolean> = {};
      const nextSettings: Record<string, any> = {};
      for (const { id, json } of responses) {
        nextEnabled[id] = Boolean(json?.enabled);
        nextSettings[id] = json;
      }
      setEnabled(nextEnabled);
      setSettings(nextSettings);

      const count = await tiersPromise;
      setTiersCount(count);
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка загрузки механик"));
      setTiersCount(null);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleToggle = React.useCallback(async (id: string, value: boolean) => {
    setError("");
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const endpointMap: Record<string, string> = {
        "auto-return": "/api/portal/loyalty/auto-return",
        birthday: "/api/portal/loyalty/birthday",
        "registration-bonus": "/api/portal/loyalty/registration-bonus",
        ttl: "/api/portal/loyalty/ttl",
        referral: "/api/portal/referrals/program",
      };
      const current = settings[id] || {};
      let payload: Record<string, any> = {};
      if (id === "auto-return") {
        payload = {
          enabled: value,
          days: Number(current.days || 45),
          text: String(current.text || "Мы скучаем! Возвращайтесь и получите бонусные баллы."),
          giftEnabled: Boolean(current.giftEnabled),
          giftPoints: Number(current.giftPoints || 0),
          giftBurnEnabled: Boolean(current.giftBurnEnabled),
          giftTtlDays: Number(current.giftTtlDays || 0),
          repeatEnabled: Boolean(current.repeatEnabled),
          repeatDays: Number(current.repeatDays || 0),
        };
      } else if (id === "birthday") {
        payload = {
          enabled: value,
          daysBefore: Number(current.daysBefore || 5),
          onlyBuyers: Boolean(current.onlyBuyers),
          text: String(current.text || "С днём рождения! Мы подготовили для вас подарок в любимой кофейне."),
          giftEnabled: Boolean(current.giftEnabled),
          giftPoints: Number(current.giftPoints || 0),
          giftBurnEnabled: Boolean(current.giftBurnEnabled),
          giftTtlDays: Number(current.giftTtlDays || 0),
        };
      } else if (id === "registration-bonus") {
        const points = Number(current.points || 0);
        if (value && (!Number.isFinite(points) || points <= 0)) {
          throw new Error("Укажите положительное число баллов на странице механики регистрации");
        }
        payload = {
          enabled: value,
          points,
          burnEnabled: Boolean(current.burnEnabled),
          burnTtlDays: Number(current.burnTtlDays || 0),
          delayEnabled: Boolean(current.delayEnabled),
          delayDays: Number(current.delayDays || 0),
          delayHours: Number(current.delayHours || 0),
          pushEnabled: Boolean(current.pushEnabled),
          text: typeof current.text === "string" ? current.text : "",
        };
      } else if (id === "ttl") {
        payload = {
          enabled: value,
          daysBefore: Number(current.daysBefore || 5),
          text: String(
            current.text || "Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!"
          ),
        };
      } else if (id === "referral") {
        const placeholders = Array.isArray(current.placeholders) && current.placeholders.length
          ? current.placeholders
          : ["{businessname}", "{bonusamount}", "{code}", "{link}"];
        const multiLevel = Boolean(current.multiLevel);
        const base: Record<string, any> = {
          enabled: value,
          rewardTrigger: current.rewardTrigger === "all" ? "all" : "first",
          rewardType: current.rewardType === "percent" ? "percent" : "fixed",
          multiLevel,
          stackWithRegistration: Boolean(current.stackWithRegistration),
          friendReward: Number(current.friendReward || 0),
          message: typeof current.message === "string" ? current.message : "",
          placeholders,
        };
        if (multiLevel) {
          const levels = Array.isArray(current.levels) ? current.levels : [];
          base.levels = levels.map((lvl: any) => ({
            level: Number(lvl?.level || 0),
            enabled: Boolean(lvl?.enabled),
            reward: Number(lvl?.reward || 0),
          }));
        } else {
          base.rewardValue = Number(current.rewardValue || 0);
        }
        payload = base;
      }

      const endpoint = endpointMap[id];
      if (!endpoint) throw new Error(`Unknown endpoint: ${id}`);
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Не удалось сохранить настройку");
      }
      setEnabled((prev) => ({ ...prev, [id]: value }));
      setSettings((prev) => ({ ...prev, [id]: { ...current, enabled: value } }));
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка сохранения"));
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }, [settings]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Механики лояльности</h2>
        <p className="text-gray-500 mt-1">Настройка правил начисления, списания и автоматических коммуникаций.</p>
      </div>

      {/* Cards Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Базовые настройки</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards
            .filter((card) => card.id === "levels" || card.id === "redeem-limits")
            .map((card) => {
              const isLevels = card.id === "levels";
              const iconHoverClass = isLevels
                ? "group-hover:bg-yellow-100"
                : card.id === "redeem-limits"
                  ? "group-hover:bg-red-100"
                  : "";

              return (
                <div
                  key={card.id}
                  onClick={() => router.push(card.href)}
                  className={
                    "bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-start justify-between" +
                    (isLevels ? " relative overflow-hidden" : "")
                  }
                >
                  <div className={"flex items-start space-x-4" + (isLevels ? " relative z-10" : "")}
                  >
                    <div className={`p-3 rounded-lg ${card.color || "bg-gray-50 text-gray-600"} ${iconHoverClass} transition-colors`}>
                      {card.icon}
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors">
                        {card.title}
                      </h4>
                      <p className="text-sm text-gray-500 mt-1">{card.description}.</p>
                      {isLevels ? (
                        <div className="mt-3 flex items-center space-x-2 text-xs font-medium text-gray-400 group-hover:text-purple-500">
                          <span>Настроено: {tiersCount == null ? "—" : `${tiersCount} ур.`}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-full group-hover:bg-purple-50 text-gray-300 group-hover:text-purple-600 transition-colors">
                    <ChevronRight size={20} />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Дополнительные возможности</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards
            .filter((card) => card.toggle)
            .map((card) => {
              const isOn = Boolean(enabled[card.id]);
              const isSaving = Boolean(saving[card.id]);

              return (
                <div
                  key={card.id}
                  onClick={() => router.push(card.href)}
                  className={
                    "bg-white p-6 rounded-xl border transition-all duration-200 cursor-pointer group hover:shadow-md hover:border-purple-200 relative " +
                    (isOn ? "border-gray-200 shadow-sm" : "border-gray-100 bg-gray-50/30")
                  }
                >
                  <div className="flex justify-between items-start mb-4">
                    <div
                      className={
                        "p-3 rounded-lg transition-colors " +
                        (isOn ? card.color || "bg-gray-50 text-gray-600" : "bg-gray-100 text-gray-400 group-hover:text-gray-600")
                      }
                    >
                      {card.icon}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleToggle(card.id, !isOn);
                      }}
                      disabled={isSaving}
                      className={
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 z-10 disabled:opacity-60 " +
                        (isOn ? "bg-purple-600" : "bg-gray-300")
                      }
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform " +
                          (isOn ? "translate-x-6" : "translate-x-1")
                        }
                      />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <h4 className={"text-lg font-bold transition-colors " + (isOn ? "text-gray-900" : "text-gray-600")}>
                        {card.title}
                      </h4>
                      {!isOn && (
                        <span className="text-[10px] uppercase font-bold text-gray-500 border border-gray-300 px-1.5 rounded">
                          Выкл
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 min-h-[40px]">{card.description}</p>

                    <div className="pt-4 mt-2 border-t border-gray-50 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(card.href);
                        }}
                        className={
                          "text-sm font-medium transition-colors flex items-center hover:text-purple-700 " +
                          (isOn ? "text-purple-600" : "text-gray-500")
                        }
                      >
                        <Settings size={14} className="mr-1.5" />
                        Настроить
                      </button>
                      {isOn ? (
                        <span className="flex items-center text-xs text-green-600 font-medium">
                          <Power size={12} className="mr-1" /> Активна
                        </span>
                      ) : (
                        <span className="flex items-center text-xs text-gray-400">
                          <Power size={12} className="mr-1" /> Отключена
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Error Message */}
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Ошибка</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{error}</div>
          <button type="button" className="text-red-700 underline underline-offset-2" onClick={() => void loadAll()}>
            Повторить
          </button>
        </div>
      ) : null}
    </div>
  );
}
