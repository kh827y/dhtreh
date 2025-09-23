"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

export default function RegistrationBonusPage() {
  const [enabled, setEnabled] = React.useState(true);
  const [amount, setAmount] = React.useState("150");
  const [burnEnabled, setBurnEnabled] = React.useState(false);
  const [delayEnabled, setDelayEnabled] = React.useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Настройки сохранены (демо)");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Баллы за регистрацию</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Баллы за регистрацию</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Приветственный бонус новым участникам программы</div>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
            <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "Механика включена" : "Механика выключена"} />

            <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
              <span>Сколько баллов начислять за регистрацию</span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
              />
            </label>

            <Toggle checked={burnEnabled} onChange={setBurnEnabled} label="Сделать начисляемые баллы сгораемыми" />
            {burnEnabled && (
              <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                <span>Через сколько дней баллы сгорят</span>
                <input
                  type="number"
                  min="1"
                  defaultValue="30"
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
            )}

            <Toggle checked={delayEnabled} onChange={setDelayEnabled} label="Отложить начисление баллов" />

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" type="submit">Сохранить</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
