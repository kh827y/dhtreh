"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import { useRouter } from "next/navigation";

const levelDictionary = {
  base: {
    id: "base",
    name: "Базовый",
    accrual: 3,
    redeem: 20,
    minPayment: 0,
    threshold: 0,
    starter: true,
    hidden: false,
  },
  silver: {
    id: "silver",
    name: "Silver",
    accrual: 5,
    redeem: 30,
    minPayment: 0,
    threshold: 15000,
    starter: false,
    hidden: false,
  },
  gold: {
    id: "gold",
    name: "Gold",
    accrual: 7,
    redeem: 40,
    minPayment: 0,
    threshold: 45000,
    starter: false,
    hidden: false,
  },
  vip: {
    id: "vip",
    name: "VIP",
    accrual: 10,
    redeem: 50,
    minPayment: 1000,
    threshold: 90000,
    starter: false,
    hidden: true,
  },
} as const;

export default function LevelEditPage({ params }: { params: { levelId: string } }) {
  const router = useRouter();
  const level = (levelDictionary as Record<string, typeof levelDictionary.base | undefined>)[params.levelId] ?? levelDictionary.base;

  const [name, setName] = React.useState(level.name);
  const [accrual, setAccrual] = React.useState(String(level.accrual));
  const [redeem, setRedeem] = React.useState(String(level.redeem));
  const [minPayment, setMinPayment] = React.useState(String(level.minPayment));
  const [threshold, setThreshold] = React.useState(String(level.threshold));
  const [starter, setStarter] = React.useState(level.starter);
  const [hidden, setHidden] = React.useState(level.hidden);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Изменения сохранены (демо)");
    router.push(`/loyalty/mechanics/levels/${level.id}`);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <a href="/loyalty/mechanics/levels" style={{ color: "inherit", textDecoration: "none" }}>Уровни клиентов</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <a href={`/loyalty/mechanics/levels/${level.id}`} style={{ color: "inherit", textDecoration: "none" }}>{level.name}</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Редактирование</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Редактирование уровня</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Измените параметры бонусов и доступности уровня</div>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Название</span>
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>% начисления</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={accrual}
                  onChange={(event) => setAccrual(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>% списания от чека</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={redeem}
                  onChange={(event) => setRedeem(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Минимальная сумма к оплате</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={minPayment}
                  onChange={(event) => setMinPayment(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Сумма покупок (порог перевода)</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={starter} onChange={(event) => setStarter(event.target.checked)} />
                <span>
                  <div>Стартовая</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Группа автоматически присваивается при регистрации</div>
                </span>
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
                <span>
                  <div>Скрытая группа</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Видна только участникам уровня; перевод — вручную или по промокоду</div>
                </span>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button variant="secondary" type="button" onClick={() => router.back()}>Отмена</Button>
              <Button variant="primary" type="submit">Сохранить</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
