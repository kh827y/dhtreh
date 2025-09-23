"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

const quickRanges = ["Вчера", "Неделя", "Месяц", "Квартал", "Год"] as const;
const outlets = ["Все торговые точки", "ТЦ «Центральный»", "ТРК «Сфера»", "Онлайн"];

export default function BirthdayPage() {
  const [enabled, setEnabled] = React.useState(true);
  const [tab, setTab] = React.useState<"main" | "stats">("main");
  const [daysBefore, setDaysBefore] = React.useState("5");
  const [onlyBuyers, setOnlyBuyers] = React.useState(true);
  const [text, setText] = React.useState("С днём рождения! Дарим 300 бонусов на покупки в вашем любимом месте.");
  const [gift, setGift] = React.useState(true);
  const [giftAmount, setGiftAmount] = React.useState("300");
  const [giftBurn, setGiftBurn] = React.useState(true);
  const [giftBurnDays, setGiftBurnDays] = React.useState("20");

  const charsLeft = Math.max(0, 300 - text.length);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Настройки сохранены (демо)");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Поздравить клиентов с днём рождения</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Поздравить клиентов с днём рождения</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Автоматическая рассылка поздравлений и подарочных баллов</div>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "Сценарий включен" : "Сценарий выключен"} />
      </div>

      <div style={{ display: "flex", gap: 12, borderBottom: "1px solid rgba(148,163,184,0.2)", flexWrap: "wrap" }}>
        <TabButton active={tab === "main"} onClick={() => setTab("main")}>Основное</TabButton>
        <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>Статистика</TabButton>
      </div>

      {tab === "main" ? (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
              <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
                <span>За сколько дней поздравлять клиента</span>
                <input
                  type="number"
                  min="0"
                  value={daysBefore}
                  onChange={(event) => setDaysBefore(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>

              <Toggle
                checked={onlyBuyers}
                onChange={setOnlyBuyers}
                label="Поздравлять только тех клиентов, которые ранее совершали покупки"
              />

              <label style={{ display: "grid", gap: 6 }}>
                <span>Текст push-рассылки</span>
                <textarea
                  value={text}
                  maxLength={300}
                  onChange={(event) => setText(event.target.value)}
                  rows={4}
                  style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                  <span>Осталось символов: {charsLeft}</span>
                  <span>Плейсхолдеры: %username%, %username|обращение_по_умолчанию%</span>
                </div>
              </label>

              <div style={{ display: "grid", gap: 16 }}>
                <Toggle checked={gift} onChange={setGift} label="Подарить баллы клиенту" />
                {gift && (
                  <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                    <span>Сколько баллов подарить клиенту</span>
                    <input
                      type="number"
                      min="0"
                      value={giftAmount}
                      onChange={(event) => setGiftAmount(event.target.value)}
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                    />
                  </label>
                )}
              </div>

              {gift && (
                <div style={{ display: "grid", gap: 16 }}>
                  <Toggle checked={giftBurn} onChange={setGiftBurn} label="Сделать подарочные баллы сгораемыми" />
                  {giftBurn && (
                    <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                      <span>Через сколько дней баллы сгорят</span>
                      <input
                        type="number"
                        min="1"
                        value={giftBurnDays}
                        onChange={(event) => setGiftBurnDays(event.target.value)}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                      />
                    </label>
                  )}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="primary">Сохранить</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <BirthdayStats />
      )}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: "transparent",
        padding: "12px 0",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--brand-primary)" : "#e2e8f0",
        borderBottom: active ? "2px solid var(--brand-primary)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function BirthdayStats() {
  const [range, setRange] = React.useState<string>(quickRanges[2]);
  const [outlet, setOutlet] = React.useState<string>(outlets[0]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <CardBody style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Фильтры</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Быстрый период</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickRanges.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setRange(item)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 999,
                      border: range === item ? "1px solid transparent" : "1px solid rgba(148,163,184,0.35)",
                      background: range === item ? "var(--brand-primary)" : "rgba(15,23,42,0.6)",
                      color: "#e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Диапазон дат</span>
              <input
                type="date"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Торговая точка</span>
              <select
                value={outlet}
                onChange={(event) => setOutlet(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              >
                {outlets.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Сводные показатели</div>
          <KpiGrid
            items={[
              { label: "Выслано поздравлений", value: "1 820" },
              { label: "Совершивших покупку", value: "294" },
              { label: "Выручки сгенерировано", value: "1 240 000 ₽" },
              { label: "Средний чек", value: "1 520 ₽" },
              { label: "Затраты на баллы", value: "43 800 ₽" },
            ]}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 18 }}>
          <ChartPlaceholder title="Поздравления и покупки" />
          <ChartPlaceholder title="Выручка" />
        </CardBody>
      </Card>
    </div>
  );
}

function KpiGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
      {items.map((item) => (
        <div key={item.label} style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(148,163,184,0.08)", display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{item.label}</span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div
        style={{
          height: 220,
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(96,165,250,0.18), rgba(244,114,182,0.1))",
          display: "grid",
          placeItems: "center",
          opacity: 0.6,
          fontSize: 12,
        }}
      >
        График доступен в аналитическом отчёте
      </div>
    </div>
  );
}
