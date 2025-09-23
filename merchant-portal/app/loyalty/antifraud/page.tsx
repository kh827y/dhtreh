"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

export default function AntifraudPage() {
  const [enabled, setEnabled] = React.useState(true);
  const [dailyLimit, setDailyLimit] = React.useState(5000);
  const [perCustomerLimit, setPerCustomerLimit] = React.useState(1000);
  const [sameCard, setSameCard] = React.useState(true);
  const [toast, setToast] = React.useState("");

  const handleSave = () => {
    if (dailyLimit <= 0 || perCustomerLimit <= 0) {
      setToast("Пределы должны быть положительными числами");
      return;
    }
    setToast("Настройки антифрода сохранены (демо)");
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>Антифрод</h1>
        <div style={{ opacity: 0.75, fontSize: 14 }}>
          Ограничения на начисления и списания, мониторинг подозрительных операций
        </div>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardHeader title="Правила и ограничения" />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <Toggle checked={enabled} onChange={setEnabled} label="Включить антифрод" />

          <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Лимит начислений в день, баллов</span>
            <input
              type="number"
              min={1}
              value={dailyLimit}
              onChange={(event) => setDailyLimit(Number(event.target.value))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, maxWidth: 280 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Лимит для одного клиента, баллов</span>
            <input
              type="number"
              min={1}
              value={perCustomerLimit}
              onChange={(event) => setPerCustomerLimit(Number(event.target.value))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <Toggle checked={sameCard} onChange={setSameCard} label="Блокировать повторные операции с одной карты" />

          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>События для расследования</span>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              <li>Несколько списаний за короткий период</li>
              <li>Попытки провести чеки с заблокированными картами</li>
              <li>Резкий рост начислений по одному клиенту</li>
            </ul>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={handleSave}>
              Сохранить настройки
            </Button>
            <Button variant="ghost" onClick={() => { setEnabled(true); setDailyLimit(5000); setPerCustomerLimit(1000); setSameCard(true); }}>
              Сбросить
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Журнал подозрительных операций" />
        <CardBody>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, textTransform: "uppercase", opacity: 0.65 }}>
                  <th style={{ padding: "12px 8px" }}>Дата</th>
                  <th style={{ padding: "12px 8px" }}>Клиент</th>
                  <th style={{ padding: "12px 8px" }}>Тип</th>
                  <th style={{ padding: "12px 8px" }}>Описание</th>
                  <th style={{ padding: "12px 8px" }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((index) => (
                  <tr key={index} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: "12px 8px" }}>{new Date(Date.now() - index * 7200000).toLocaleString("ru-RU")}</td>
                    <td style={{ padding: "12px 8px" }}>Клиент #{index + 1}</td>
                    <td style={{ padding: "12px 8px" }}>{index % 2 === 0 ? "Списание" : "Начисление"}</td>
                    <td style={{ padding: "12px 8px" }}>Повторная попытка использования одной карты</td>
                    <td style={{ padding: "12px 8px" }}>{index === 0 ? "Рассматривается" : "Закрыто"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
