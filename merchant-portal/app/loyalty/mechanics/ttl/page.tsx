"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

export default function BurnReminderPage() {
  const [enabled, setEnabled] = React.useState(true);
  const [days, setDays] = React.useState("5");
  const [text, setText] = React.useState("Баллы в размере %amount% сгорят %burn_date%. Успейте воспользоваться!");

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
        <span style={{ color: "var(--brand-primary)" }}>Напоминание о сгорании баллов</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Напоминание о сгорании баллов</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Уведомляйте клиентов о скором сгорании подарочных баллов</div>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
            <Toggle
              checked={enabled}
              onChange={setEnabled}
              label={enabled ? "Уведомления включены" : "Уведомления выключены"}
            />

            <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
              <span>За сколько дней отправлять сообщение (дней)</span>
              <input
                type="number"
                min="1"
                value={days}
                onChange={(event) => setDays(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Текст push-уведомления</span>
              <textarea
                value={text}
                maxLength={300}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, display: "flex", justifyContent: "space-between" }}>
                <span>Осталось символов: {charsLeft}</span>
                <span>Плейсхолдеры: %username%, %amount%, %burn_date%</span>
              </div>
            </label>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", alignItems: "stretch" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Предпросмотр</div>
                <div
                  style={{
                    borderRadius: 16,
                    padding: "16px 18px",
                    background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(236,72,153,0.12))",
                    minHeight: 120,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Push-уведомление</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Скоро сгорят баллы</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>{text}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Отправим за {days} дней до даты сгорания</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="submit" variant="primary">Сохранить</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
