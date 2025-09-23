"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import { useRouter } from "next/navigation";

type LevelRow = {
  id: string;
  name: string;
  threshold: number;
  accrualPercent: number;
  redeemPercent: number;
  starter: boolean;
  hidden: boolean;
  customers: number;
};

const levels: LevelRow[] = [
  {
    id: "base",
    name: "Базовый",
    threshold: 0,
    accrualPercent: 3,
    redeemPercent: 20,
    starter: true,
    hidden: false,
    customers: 2841,
  },
  {
    id: "silver",
    name: "Silver",
    threshold: 15000,
    accrualPercent: 5,
    redeemPercent: 30,
    starter: false,
    hidden: false,
    customers: 932,
  },
  {
    id: "gold",
    name: "Gold",
    threshold: 45000,
    accrualPercent: 7,
    redeemPercent: 40,
    starter: false,
    hidden: false,
    customers: 212,
  },
  {
    id: "vip",
    name: "VIP",
    threshold: 90000,
    accrualPercent: 10,
    redeemPercent: 50,
    starter: false,
    hidden: true,
    customers: 38,
  },
];

export default function LevelsPage() {
  const router = useRouter();

  const total = levels.length;
  const from = total > 0 ? 1 : 0;
  const to = total;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Уровни клиентов</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Уровни клиентов</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Настройка порогов перехода и бонусных процентов</div>
        </div>
        <Button variant="primary" onClick={() => router.push("/loyalty/mechanics/levels/create")}>Добавить группу</Button>
      </div>

      <Card>
        <CardBody>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Уровни позволяют мотивировать клиентов на рост покупок. Задайте порог накопленных чеков для перехода и укажите повышенные проценты начисления или списания. Статус отображается в приложении и на кассе.
          </div>
        </CardBody>
      </Card>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
              <th style={{ padding: "12px 8px" }}>Название</th>
              <th style={{ padding: "12px 8px" }}>Сумма покупок</th>
              <th style={{ padding: "12px 8px" }}>% начисления</th>
              <th style={{ padding: "12px 8px" }}>% списания</th>
              <th style={{ padding: "12px 8px" }}>Стартовая</th>
              <th style={{ padding: "12px 8px" }}>Скрытая</th>
              <th style={{ padding: "12px 8px" }}>Клиентов</th>
              <th style={{ padding: "12px 8px" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr
                key={level.id}
                style={{ borderTop: "1px solid rgba(148,163,184,0.12)", cursor: "pointer" }}
                onClick={() => router.push(`/loyalty/mechanics/levels/${level.id}`)}
              >
                <td style={{ padding: "12px 8px", fontWeight: 600 }}>{level.name}</td>
                <td style={{ padding: "12px 8px" }}>{level.threshold.toLocaleString("ru-RU")} ₽</td>
                <td style={{ padding: "12px 8px" }}>{level.accrualPercent.toFixed(1)}%</td>
                <td style={{ padding: "12px 8px" }}>{level.redeemPercent.toFixed(1)}%</td>
                <td style={{ padding: "12px 8px" }}>{level.starter ? "Да" : "Нет"}</td>
                <td style={{ padding: "12px 8px" }}>{level.hidden ? "Да" : "Нет"}</td>
                <td style={{ padding: "12px 8px" }}>{level.customers.toLocaleString("ru-RU")}</td>
                <td style={{ padding: "12px 8px" }} onClick={(event) => { event.stopPropagation(); router.push(`/loyalty/mechanics/levels/${level.id}/edit`); }}>
                  <button
                    type="button"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--brand-primary)",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    ✏️ Редактировать
                  </button>
                </td>
              </tr>
            ))}
            {!levels.length && (
              <tr>
                <td colSpan={8} style={{ padding: "16px 8px", opacity: 0.7 }}>
                  Пока уровней нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, opacity: 0.65 }}>
        Показаны записи {from} — {to} из {total}
      </div>
    </div>
  );
}
