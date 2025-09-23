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
  },
];

export default function MechanicsPage() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({
    "auto-return": true,
    birthday: true,
    "registration-bonus": false,
    ttl: true,
  });

  const handleToggle = React.useCallback((id: string, value: boolean) => {
    setEnabled((prev) => ({ ...prev, [id]: value }));
  }, []);

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
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
