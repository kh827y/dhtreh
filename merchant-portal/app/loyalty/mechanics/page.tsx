"use client";

import React from "react";
import { Card } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type MechanicCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  href: string;
  toggle?: boolean;
};

const cards: MechanicCard[] = [
  {
    id: "levels",
    title: "Уровни клиентов",
    description: "Ступени программы и условия перехода",
    icon: "🏆",
    href: "/loyalty/mechanics/levels",
  },
  {
    id: "redeem-limits",
    title: "Ограничения в баллах за покупки",
    description: "Срок жизни, запреты и задержки начисления",
    icon: "⚖️",
    href: "/loyalty/mechanics/redeem-limits",
  },
  {
    id: "auto-return",
    title: "Автовозврат клиентов",
    description: "Возвращаем неактивных клиентов подарочными баллами",
    icon: "🔁",
    href: "/loyalty/mechanics/auto-return",
    toggle: true,
  },
  {
    id: "birthday",
    title: "Поздравить клиентов с днём рождения",
    description: "Автопоздравления и подарки к празднику",
    icon: "🎂",
    href: "/loyalty/mechanics/birthday",
    toggle: true,
  },
  {
    id: "registration-bonus",
    title: "Баллы за регистрацию",
    description: "Приветственный бонус новым участникам",
    icon: "🎁",
    href: "/loyalty/mechanics/registration-bonus",
    toggle: true,
  },
  {
    id: "ttl",
    title: "Напоминание о сгорании баллов",
    description: "Предупреждение клиентов о скором сгорании",
    icon: "⏳",
    href: "/loyalty/mechanics/ttl",
    toggle: true,
  },
  {
    id: "referral",
    title: "Реферальная программа",
    description: "Вознаграждение за приглашения друзей",
    icon: "🤝",
    href: "/referrals/program",
    toggle: true,
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
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Механики</div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>Настраивайте сценарии лояльности и активации клиентов</div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {cards.map((card) => {
          const showToggle = Boolean(card.toggle);
          const isOn = enabled[card.id];
          return (
            <Card key={card.id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 20 }}>
              <button
                onClick={() => (window.location.href = card.href)}
                style={{
                  all: "unset",
                  display: "grid",
                  gap: 12,
                  cursor: "pointer",
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: "rgba(148,163,184,0.12)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 24,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{card.title}</div>
                  <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.45 }}>{card.description}</div>
                </div>
              </button>

              <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <a
                  href={card.href}
                  style={{ color: "var(--brand-primary)", fontSize: 13, textDecoration: "none" }}
                >
                  Открыть
                </a>
                {showToggle && (
                  <Toggle
                    checked={!!isOn}
                    onChange={(value) => handleToggle(card.id, value)}
                    label={isOn ? "Включено" : "Отключено"}
                    disabled={!!saving[card.id]}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {error && (
        <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}
