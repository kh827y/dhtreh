"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

const rewardTriggers = [
  { value: "first", label: "За первую покупку друга" },
  { value: "all", label: "За все покупки друга" },
] as const;

const rewardTypes = [
  { value: "fixed", label: "Фиксированное количество баллов" },
  { value: "percent", label: "Процент от суммы покупки" },
] as const;

export default function ReferralProgramSettingsPage() {
  const [enabled, setEnabled] = React.useState(true);
  const [trigger, setTrigger] = React.useState<typeof rewardTriggers[number]["value"]>("first");
  const [type, setType] = React.useState<typeof rewardTypes[number]["value"]>("fixed");
  const [multiLevel, setMultiLevel] = React.useState(false);
  const [rewardValue, setRewardValue] = React.useState("300");
  const [friendBonus, setFriendBonus] = React.useState("150");
  const [stackWithRegistration, setStackWithRegistration] = React.useState(false);
  const [message, setMessage] = React.useState("Расскажи друзьям о нашей программе и получи бонус. Делись ссылкой {link} или промокодом {code}.");

  const charsLeft = Math.max(0, 300 - message.length);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Настройки сохранены (демо)");
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>Реферальная программа</span>
      </nav>

      <div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Реферальная программа</div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Вознаграждайте клиентов за приглашения друзей</div>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 24 }}>
            <Toggle checked={enabled} onChange={setEnabled} label={enabled ? "Сценарий включен" : "Сценарий выключен"} />

            <section style={{ display: "grid", gap: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Приглашающий</div>

              <fieldset style={{ border: "none", padding: 0, display: "grid", gap: 8 }}>
                <legend style={{ fontSize: 13, opacity: 0.7 }}>За что поощрять?</legend>
                {rewardTriggers.map((option) => (
                  <label key={option.value} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="radio"
                      name="reward-trigger"
                      value={option.value}
                      checked={trigger === option.value}
                      onChange={() => setTrigger(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>

              <fieldset style={{ border: "none", padding: 0, display: "grid", gap: 8 }}>
                <legend style={{ fontSize: 13, opacity: 0.7 }}>Тип поощрения</legend>
                {rewardTypes.map((option) => (
                  <label key={option.value} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="radio"
                      name="reward-type"
                      value={option.value}
                      checked={type === option.value}
                      onChange={() => {
                        setType(option.value);
                        setRewardValue(option.value === "fixed" ? "300" : "10");
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>

              <Toggle
                checked={multiLevel}
                onChange={setMultiLevel}
                label="Многоуровневая система поощрения"
              />
              {multiLevel && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Награда начисляется за друга и приглашённых им клиентов при их покупках.
                </div>
              )}

              <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                <span>Размер поощрения ({type === "fixed" ? "баллы" : "%"})</span>
                <input
                  type="number"
                  min="0"
                  value={rewardValue}
                  onChange={(event) => setRewardValue(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 140,
                  height: 70,
                  background: "rgba(148,163,184,0.1)",
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 26,
                }}>
                  🤝
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Схема: Приглашающий → Друг. При многоуровневой системе добавляется цепочка «Друг → Его приглашённые».</div>
              </div>
            </section>

            <section style={{ display: "grid", gap: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Друг</div>

              <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
                <span>Сколько баллов получит приглашённый друг?</span>
                <input
                  type="number"
                  min="0"
                  value={friendBonus}
                  onChange={(event) => setFriendBonus(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={stackWithRegistration}
                  onChange={(event) => setStackWithRegistration(event.target.checked)}
                />
                <span>
                  <div>Суммировать баллы по реферальной программе и баллы за регистрацию</div>
                  {stackWithRegistration && (
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Например: 150 баллов за регистрацию + 300 по рефералке = 450 баллов.</div>
                  )}
                </span>
              </label>
            </section>

            <section style={{ display: "grid", gap: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Настройка сообщения по приглашению</div>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Текст сообщения при нажатии «Пригласить друга»</span>
                <textarea
                  value={message}
                  maxLength={300}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  style={{ padding: "12px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Осталось символов: {charsLeft}. Плейсхолдеры: {"{businessname}"}, {"{bonusamount}"}, {"{code}"}, {"{link}"}
                </div>
              </label>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" type="submit">Сохранить</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
