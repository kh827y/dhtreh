"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

export default function RedeemLimitsPage() {
  const [ttlEnabled, setTtlEnabled] = React.useState(true);
  const [ttlDays, setTtlDays] = React.useState("365");
  const [forbidSameReceipt, setForbidSameReceipt] = React.useState(true);
  const [delayEnabled, setDelayEnabled] = React.useState(false);
  const [delayDays, setDelayDays] = React.useState("7");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Настройки сохранены (демо)");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Ограничения в баллах за покупки</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Ограничения в баллах за покупки</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Настройте срок действия бонусов и запреты на одновременные операции</div>
      </div>

      <Card>
        <CardBody>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Здесь задаются системные ограничения для начисленных баллов: срок жизни, правила единовременного использования и задержки на их активацию. Клиент увидит эти условия в приложении и кассир — в рабочем месте.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <Toggle
                  checked={ttlEnabled}
                  onChange={setTtlEnabled}
                  label={ttlEnabled ? "Ограничение включено" : "Ограничение выключено"}
                  title="Срок жизни начисленных баллов"
                />
                <span style={{ fontSize: 12, opacity: 0.7 }}>Срок действия начисленных баллов. После истечения — баллы сгорают.</span>
              </div>
              {ttlEnabled && (
                <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                  <span>Через сколько дней баллы за покупки сгорят</span>
                  <input
                    type="number"
                    min="1"
                    value={ttlDays}
                    onChange={(event) => setTtlDays(event.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Toggle
                checked={forbidSameReceipt}
                onChange={setForbidSameReceipt}
                label="Запретить списывать и начислять баллы одновременно в чеке"
              />
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Toggle
                checked={delayEnabled}
                onChange={setDelayEnabled}
                label={delayEnabled ? "Задержка включена" : "Задержка выключена"}
              />
              {delayEnabled && (
                <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                  <span>Баллы можно использовать через указанное количество дней</span>
                  <input
                    type="number"
                    min="1"
                    value={delayDays}
                    onChange={(event) => setDelayDays(event.target.value)}
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                  />
                </label>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" type="submit">Сохранить</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
