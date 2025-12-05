"use client";

import React from "react";
import { Card, CardBody, Badge } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";
import {
  Trophy,
  Scale,
  RotateCcw,
  Cake,
  Gift,
  Timer,
  Users,
  Sparkles,
  ChevronRight,
  Zap,
  Settings,
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
    icon: <Trophy size={22} />,
    href: "/loyalty/mechanics/levels",
    color: "rgba(250, 204, 21, 0.15)",
  },
  {
    id: "redeem-limits",
    title: "Ограничения в баллах",
    description: "Срок жизни, запреты и задержки начисления баллов",
    icon: <Scale size={22} />,
    href: "/loyalty/mechanics/redeem-limits",
    color: "rgba(148, 163, 184, 0.15)",
  },
  {
    id: "auto-return",
    title: "Автовозврат клиентов",
    description: "Возвращаем неактивных клиентов подарочными баллами",
    icon: <RotateCcw size={22} />,
    href: "/loyalty/mechanics/auto-return",
    toggle: true,
    color: "rgba(99, 102, 241, 0.15)",
  },
  {
    id: "birthday",
    title: "Поздравление с днём рождения",
    description: "Автопоздравления и подарочные баллы к празднику",
    icon: <Cake size={22} />,
    href: "/loyalty/mechanics/birthday",
    toggle: true,
    color: "rgba(236, 72, 153, 0.15)",
  },
  {
    id: "registration-bonus",
    title: "Баллы за регистрацию",
    description: "Приветственный бонус новым участникам программы",
    icon: <Gift size={22} />,
    href: "/loyalty/mechanics/registration-bonus",
    toggle: true,
    color: "rgba(16, 185, 129, 0.15)",
  },
  {
    id: "ttl",
    title: "Напоминание о сгорании",
    description: "Предупреждение клиентов о скором сгорании баллов",
    icon: <Timer size={22} />,
    href: "/loyalty/mechanics/ttl",
    toggle: true,
    color: "rgba(245, 158, 11, 0.15)",
  },
  {
    id: "referral",
    title: "Реферальная программа",
    description: "Вознаграждение за приглашение новых клиентов",
    icon: <Users size={22} />,
    href: "/referrals/program",
    toggle: true,
    color: "rgba(6, 182, 212, 0.15)",
  },
];

export default function MechanicsPage() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({});
  const [settings, setSettings] = React.useState<Record<string, any>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string>("");

  const loadAll = React.useCallback(async () => {
    setError("");
    try {
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
          const res = await fetch(endpoints[id]);
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
    } catch (e: any) {
      setError(String(e?.message || e || "Ошибка загрузки механик"));
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

      const res = await fetch(endpointMap[id], {
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
    <div className="animate-in" style={{ display: "grid", gap: 28 }}>
      {/* Page Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand-primary-light)",
        }}>
          <Sparkles size={24} />
        </div>
        <div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Механики лояльности
          </h1>
          <p style={{ 
            fontSize: 14, 
            color: "var(--fg-muted)", 
            margin: "6px 0 0",
          }}>
            Настраивайте сценарии лояльности и активации клиентов
          </p>
        </div>
      </header>

      {/* Cards Grid */}
      <div style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
      }}>
        {cards.map((card, index) => {
          const showToggle = Boolean(card.toggle);
          const isOn = enabled[card.id];
          
          return (
            <Card 
              key={card.id} 
              hover
              className="animate-in"
              style={{ 
                animationDelay: `${index * 0.05}s`,
                display: "flex", 
                flexDirection: "column",
              }}
            >
              <CardBody style={{ padding: 0, flex: 1, display: "flex", flexDirection: "column" }}>
                <a
                  href={card.href}
                  style={{
                    textDecoration: "none",
                    color: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    padding: 20,
                    flex: 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: "var(--radius-md)",
                      background: card.color || "rgba(99, 102, 241, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--fg)",
                    }}>
                      {card.icon}
                    </div>
                    
                    {showToggle && (
                      <Badge 
                        variant={isOn ? "success" : "default"}
                        dot
                      >
                        {isOn ? "Активно" : "Выкл"}
                      </Badge>
                    )}
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      fontSize: 16, 
                      fontWeight: 600, 
                      margin: "0 0 6px",
                      color: "var(--fg)",
                    }}>
                      {card.title}
                    </h3>
                    <p style={{ 
                      fontSize: 13, 
                      color: "var(--fg-muted)", 
                      margin: 0,
                      lineHeight: 1.5,
                    }}>
                      {card.description}
                    </p>
                  </div>
                </a>

                {/* Footer */}
                <div style={{ 
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  background: "rgba(0, 0, 0, 0.15)",
                }}>
                  <a
                    href={card.href}
                    style={{ 
                      color: "var(--brand-primary-light)", 
                      fontSize: 13, 
                      fontWeight: 500,
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "gap 0.2s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.gap = "8px"}
                    onMouseLeave={(e) => e.currentTarget.style.gap = "4px"}
                  >
                    Настроить
                    <ChevronRight size={16} />
                  </a>
                  
                  {showToggle && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        checked={!!isOn}
                        onChange={(value) => handleToggle(card.id, value)}
                        label=""
                        disabled={!!saving[card.id]}
                      />
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ 
          padding: 16, 
          borderRadius: "var(--radius-md)", 
          border: "1px solid rgba(239, 68, 68, 0.3)",
          background: "rgba(239, 68, 68, 0.1)",
          color: "var(--danger-light)",
          fontSize: 14,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
