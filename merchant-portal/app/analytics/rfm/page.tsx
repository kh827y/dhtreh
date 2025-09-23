"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";

const mockGroups = [
  { id: 1, recency: "0–30 дней", frequency: ">4 покупок", money: "> 9 000 ₽" },
  { id: 2, recency: "31–90 дней", frequency: "2–4 покупок", money: "4 500–9 000 ₽" },
  { id: 3, recency: "91–180 дней", frequency: "1 покупка", money: "до 4 500 ₽" },
  { id: 4, recency: "> 180 дней", frequency: "0 покупок", money: "—" },
];

const mockSizes = [
  { code: "2-2-2", customers: 428 },
  { code: "2-1-1", customers: 312 },
  { code: "1-1-2", customers: 184 },
  { code: "0-0-1", customers: 132 },
  { code: "0-0-0", customers: 86 },
];

type DraftSettings = {
  recency: number;
  frequencyMode: "auto" | "manual";
  frequencyThreshold: number;
  moneyMode: "auto" | "manual";
  moneyThreshold: number;
};

const defaultSettings: DraftSettings = {
  recency: 365,
  frequencyMode: "auto",
  frequencyThreshold: 3,
  moneyMode: "auto",
  moneyThreshold: 9000,
};

export default function AnalyticsRfmPage() {
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<DraftSettings>(defaultSettings);
  const [draft, setDraft] = React.useState<DraftSettings>(defaultSettings);
  const [loading, setLoading] = React.useState(false);

  const dirty = React.useMemo(
    () =>
      draft.recency !== settings.recency ||
      draft.frequencyMode !== settings.frequencyMode ||
      draft.frequencyThreshold !== settings.frequencyThreshold ||
      draft.moneyMode !== settings.moneyMode ||
      draft.moneyThreshold !== settings.moneyThreshold,
    [draft, settings]
  );

  const applySettings = () => {
    setSettings(draft);
    setOpen(false);
  };

  const closeModal = () => {
    setDraft(settings);
    setOpen(false);
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>RFM-Анализ</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Сегментация клиентов по давности, частоте и сумме покупок</div>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>Настройки</Button>
      </header>

      <Card>
        <CardBody>
          <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>
            RFM-анализ помогает быстро понять, как давно клиенты совершали покупки, насколько часто они возвращаются и на какие суммы. Чем ниже значение R — тем более «тёплый» клиент, высокие F и M показывают лояльную аудиторию.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Группы RFM" subtitle="Текущие диапазоны сегментации" />
        <CardBody>
          {loading ? (
            <Skeleton height={180} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.7 }}>
                  <th style={{ padding: "12px 8px" }}># Группы</th>
                  <th style={{ padding: "12px 8px" }}>Давность?</th>
                  <th style={{ padding: "12px 8px" }}>Частота?</th>
                  <th style={{ padding: "12px 8px" }}>Деньги?</th>
                </tr>
              </thead>
              <tbody>
                {mockGroups.map((group) => (
                  <tr key={group.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                    <td style={{ padding: "10px 8px" }}>{group.id}</td>
                    <td style={{ padding: "10px 8px" }}>{group.recency}</td>
                    <td style={{ padding: "10px 8px" }}>{group.frequency}</td>
                    <td style={{ padding: "10px 8px" }}>{group.money}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Размер RFM-групп" subtitle="Количество клиентов в каждом сегменте" />
        <CardBody>
          {loading ? (
            <Skeleton height={180} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.7 }}>
                  <th style={{ padding: "12px 8px" }}>Группа (R-F-M)</th>
                  <th style={{ padding: "12px 8px" }}>Клиентов</th>
                </tr>
              </thead>
              <tbody>
                {mockSizes.map((row) => (
                  <tr key={row.code} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                    <td style={{ padding: "10px 8px" }}>{row.code}</td>
                    <td style={{ padding: "10px 8px" }}>{row.customers.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 90,
          }}
        >
          <div style={{ background: "#0f172a", borderRadius: 16, padding: 24, width: "min(420px, 92vw)", boxShadow: "0 24px 60px rgba(15,23,42,0.45)", position: "relative" }}>
            <button
              onClick={closeModal}
              aria-label="Закрыть"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(248,113,113,0.12)",
                color: "#f87171",
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Границы RFM-сегментов</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Recency (давность в днях)</span>
                <input
                  type="number"
                  min={1}
                  value={draft.recency}
                  onChange={(event) => setDraft((prev) => ({ ...prev, recency: Number(event.target.value) }))}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Frequency (частота)</span>
                <select
                  value={draft.frequencyMode}
                  onChange={(event) => setDraft((prev) => ({ ...prev, frequencyMode: event.target.value as DraftSettings["frequencyMode"] }))}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="auto">Автоматически</option>
                  <option value="manual">Задать вручную</option>
                </select>
                {draft.frequencyMode === "manual" && (
                  <input
                    type="number"
                    min={1}
                    value={draft.frequencyThreshold}
                    onChange={(event) => setDraft((prev) => ({ ...prev, frequencyThreshold: Number(event.target.value) }))}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                )}
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Money (сумма чека)</span>
                <select
                  value={draft.moneyMode}
                  onChange={(event) => setDraft((prev) => ({ ...prev, moneyMode: event.target.value as DraftSettings["moneyMode"] }))}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="auto">Автоматически</option>
                  <option value="manual">Задать вручную</option>
                </select>
                {draft.moneyMode === "manual" && (
                  <input
                    type="number"
                    min={0}
                    value={draft.moneyThreshold}
                    onChange={(event) => setDraft((prev) => ({ ...prev, moneyThreshold: Number(event.target.value) }))}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                )}
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <Button variant="secondary" onClick={closeModal}>Отмена</Button>
              <Button variant="primary" onClick={applySettings} disabled={!dirty}>Сохранить</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
