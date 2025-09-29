"use client";

import React, { use } from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import { useRouter } from "next/navigation";

type TierDetail = {
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
  createdAt: string;
  updatedAt: string;
};

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatPercent(value: number | null) {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function LevelDetailPage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId } = use(params);
  const router = useRouter();

  const [tier, setTier] = React.useState<TierDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/loyalty/tiers/${encodeURIComponent(levelId)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const mapped: TierDetail = {
        id: String(data?.id ?? levelId),
        name: String(data?.name ?? ""),
        description: data?.description ?? null,
        thresholdAmount: Number(data?.thresholdAmount ?? 0) || 0,
        minPaymentAmount: data?.minPaymentAmount != null ? Number(data.minPaymentAmount) : null,
        earnRatePercent: Number(data?.earnRateBps ?? 0) / 100,
        redeemRatePercent: data?.redeemRateBps != null ? Number(data.redeemRateBps) / 100 : null,
        isInitial: Boolean(data?.isInitial),
        isHidden: Boolean(data?.isHidden),
        customersCount: Number(data?.customersCount ?? 0) || 0,
        createdAt: data?.createdAt ?? new Date().toISOString(),
        updatedAt: data?.updatedAt ?? new Date().toISOString(),
      };
      setTier(mapped);
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить уровень"));
      setTier(null);
    } finally {
      setLoading(false);
    }
  }, [levelId]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!tier || tier.customersCount > 0 || deleting) return;
    if (!window.confirm("Удалить уровень?")) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/portal/loyalty/tiers/${encodeURIComponent(levelId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      router.push('/loyalty/mechanics/levels');
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось удалить уровень"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <a href="/loyalty/mechanics/levels" style={{ color: "inherit", textDecoration: "none" }}>Уровни клиентов</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>{tier?.name || "Уровень"}</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{tier?.name || (loading ? 'Загрузка…' : 'Уровень не найден')}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Параметры уровня и статистика</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={load} disabled={loading}>Обновить</Button>
          <Button variant="primary" onClick={() => router.push(`/loyalty/mechanics/levels/${levelId}/edit`)} disabled={!tier}>Редактировать</Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={!tier || tier.customersCount > 0 || deleting}
            title={tier && tier.customersCount > 0 ? "Удаление невозможно: есть клиенты" : undefined}
          >
            {deleting ? "Удаляем…" : "Удалить"}
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,.35)", padding: "12px 16px", color: "#f87171" }}>{error}</div>
      )}

      <Card>
        <CardBody>
          {loading ? (
            <Skeleton height={180} />
          ) : tier ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Параметры уровня</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <KeyValue label="ID" value={tier.id} />
                  <KeyValue label="Название" value={tier.name} />
                  <KeyValue label="Описание" value={tier.description || '—'} />
                  <KeyValue label="Порог перехода" value={formatMoney(tier.thresholdAmount)} />
                  <KeyValue label="Минимальная сумма к оплате" value={formatMoney(tier.minPaymentAmount)} />
                  <KeyValue label="% начисления" value={formatPercent(tier.earnRatePercent)} />
                  <KeyValue label="% списания" value={formatPercent(tier.redeemRatePercent)} />
                  <KeyValue label="Стартовая" value={tier.isInitial ? 'Да' : 'Нет'} />
                  <KeyValue label="Скрытая" value={tier.isHidden ? 'Да' : 'Нет'} />
                  <KeyValue label="Клиентов в группе" value={tier.customersCount.toLocaleString('ru-RU')} />
                  <KeyValue label="Создан" value={formatDate(tier.createdAt)} />
                  <KeyValue label="Обновлён" value={formatDate(tier.updatedAt)} />
                </tbody>
              </table>
            </div>
          ) : (
            <div>Уровень не найден</div>
          )}
        </CardBody>
      </Card>

      <Button variant="secondary" onClick={() => router.push('/loyalty/mechanics/levels')}>Вернуться к списку</Button>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
      <td style={{ padding: "12px 8px", width: 260, fontSize: 13, opacity: 0.75 }}>{label}</td>
      <td style={{ padding: "12px 8px", fontSize: 14 }}>{value}</td>
    </tr>
  );
}
