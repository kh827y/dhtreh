"use client";

import React from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import { useRouter } from "next/navigation";

type TierRow = {
  id: string;
  name: string;
  description: string | null;
  thresholdAmount: number;
  minPaymentAmount: number | null;
  earnRatePercent: number;
  redeemRatePercent: number | null;
  isInitial: boolean;
  isHidden: boolean;
  customersCount: number;
};

function formatMoney(value: number) {
  return value.toLocaleString("ru-RU");
}

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

export default function LevelsPage() {
  const router = useRouter();
  const [levels, setLevels] = React.useState<TierRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/loyalty/tiers");
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      const source: any[] = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];
      const mapped: TierRow[] = source.map((row) => ({
        id: String(row?.id ?? ""),
        name: String(row?.name ?? ""),
        description: row?.description ?? null,
        thresholdAmount: Number(row?.thresholdAmount ?? 0) || 0,
        minPaymentAmount: row?.minPaymentAmount != null ? Number(row.minPaymentAmount) : null,
        earnRatePercent: Number(row?.earnRateBps ?? 0) / 100,
        redeemRatePercent: row?.redeemRateBps != null ? Number(row.redeemRateBps) / 100 : null,
        isInitial: Boolean(row?.isInitial),
        isHidden: Boolean(row?.isHidden),
        customersCount: Number(row?.customersCount ?? 0) || 0,
      })).sort((a, b) => a.thresholdAmount - b.thresholdAmount);
      setLevels(mapped);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить уровни"));
      setLevels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

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
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={load} disabled={loading}>Обновить</Button>
          <Button variant="primary" onClick={() => router.push("/loyalty/mechanics/levels/create")}>Добавить группу</Button>
        </div>
      </div>

      <Card>
        <CardBody>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Уровни позволяют мотивировать клиентов на рост покупок. Задайте порог накопленных чеков для перехода и укажите повышенные проценты начисления или списания. Статус отображается в приложении и на кассе.
          </div>
        </CardBody>
      </Card>

      {error && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", padding: "12px 16px", color: "#f87171" }}>{error}</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
              <th style={{ padding: "12px 8px" }}>Название</th>
              <th style={{ padding: "12px 8px" }}>Порог перехода</th>
              <th style={{ padding: "12px 8px" }}>Минимальная сумма</th>
              <th style={{ padding: "12px 8px" }}>% начисления</th>
              <th style={{ padding: "12px 8px" }}>% списания</th>
              <th style={{ padding: "12px 8px" }}>Стартовая</th>
              <th style={{ padding: "12px 8px" }}>Скрытая</th>
              <th style={{ padding: "12px 8px" }}>Клиентов</th>
              <th style={{ padding: "12px 8px" }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ padding: "24px" }}><Skeleton height={36} /></td>
              </tr>
            ) : levels.length ? (
              levels.map((level) => (
                <tr
                  key={level.id}
                  style={{ borderTop: "1px solid rgba(148,163,184,0.12)", cursor: "pointer" }}
                  onClick={() => router.push(`/loyalty/mechanics/levels/${level.id}`)}
                >
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>{level.name}</td>
                  <td style={{ padding: "12px 8px" }}>{formatMoney(level.thresholdAmount)} ₽</td>
                  <td style={{ padding: "12px 8px" }}>{level.minPaymentAmount != null ? `${formatMoney(level.minPaymentAmount)} ₽` : "—"}</td>
                  <td style={{ padding: "12px 8px" }}>{formatPercent(level.earnRatePercent)}</td>
                  <td style={{ padding: "12px 8px" }}>{formatPercent(level.redeemRatePercent)}</td>
                  <td style={{ padding: "12px 8px" }}>{level.isInitial ? "Да" : "Нет"}</td>
                  <td style={{ padding: "12px 8px" }}>{level.isHidden ? "Да" : "Нет"}</td>
                  <td style={{ padding: "12px 8px" }}>{level.customersCount.toLocaleString("ru-RU")}</td>
                  <td
                    style={{ padding: "12px 8px" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/loyalty/mechanics/levels/${level.id}/edit`);
                    }}
                  >
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
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: "16px 8px", opacity: 0.7 }}>
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
