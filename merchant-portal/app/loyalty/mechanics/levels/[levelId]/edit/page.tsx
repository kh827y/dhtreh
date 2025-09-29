"use client";

import React, { use } from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import { useRouter } from "next/navigation";

function parseNumber(value: string) {
  if (!value.trim()) return null;
  const num = Number(value.replace(',', '.'));
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export default function LevelEditPage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [accrual, setAccrual] = React.useState("0");
  const [redeem, setRedeem] = React.useState("0");
  const [threshold, setThreshold] = React.useState("0");
  const [minPayment, setMinPayment] = React.useState("0");
  const [starter, setStarter] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [customersCount, setCustomersCount] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/loyalty/tiers/${encodeURIComponent(levelId)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setName(String(data?.name ?? ""));
      setDescription(data?.description ?? "");
      setAccrual(String((Number(data?.earnRateBps ?? 0) / 100).toFixed(1)).replace('.0', ''));
      setRedeem(
        data?.redeemRateBps != null
          ? String((Number(data.redeemRateBps) / 100).toFixed(1)).replace('.0', '')
          : "0"
      );
      setThreshold(String(Number(data?.thresholdAmount ?? 0)));
      setMinPayment(
        data?.minPaymentAmount != null
          ? String(Number(data.minPaymentAmount))
          : "0"
      );
      setStarter(Boolean(data?.isInitial));
      setHidden(Boolean(data?.isHidden));
      setCustomersCount(Number(data?.customersCount ?? 0));
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить уровень"));
    } finally {
      setLoading(false);
    }
  }, [levelId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    setError("");

    const payloadName = name.trim();
    if (!payloadName) {
      setError("Укажите название уровня");
      return;
    }

    const accrualValue = parseNumber(accrual);
    if (accrualValue == null) {
      setError("Некорректное значение для % начисления");
      return;
    }

    const redeemValue = parseNumber(redeem);
    if (redeemValue != null && redeemValue > 100) {
      setError("% списания не может превышать 100");
      return;
    }

    const thresholdValue = parseNumber(threshold);
    if (thresholdValue == null) {
      setError("Укажите порог перехода");
      return;
    }

    const minPaymentValue = parseNumber(minPayment);

    setSaving(true);
    try {
      const res = await fetch(`/api/portal/loyalty/tiers/${encodeURIComponent(levelId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payloadName,
          description: description.trim() || null,
          thresholdAmount: thresholdValue,
          minPaymentAmount: minPaymentValue,
          earnRatePercent: accrualValue,
          redeemRatePercent: redeemValue,
          isInitial: starter,
          isHidden: hidden,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/loyalty/mechanics/levels/${levelId}`);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось сохранить изменения"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <a href="/loyalty/mechanics/levels" style={{ color: "inherit", textDecoration: "none" }}>Уровни клиентов</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Редактирование</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Редактирование уровня</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Измените параметры бонусов и пороги перехода</div>
      </div>

      <Card>
        <CardBody>
          {loading ? (
            <Skeleton height={220} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
              {error && (
                <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", padding: "12px 16px", color: "#f87171" }}>{error}</div>
              )}

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
                  <span>Описание</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
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
                    <div>Стартовая группа</div>
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

              {customersCount > 0 && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  В группе сейчас {customersCount.toLocaleString('ru-RU')} клиент(ов). Удалить уровень можно только при отсутствии участников.
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <Button variant="secondary" type="button" onClick={() => router.back()} disabled={saving}>Отмена</Button>
                <Button variant="primary" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
