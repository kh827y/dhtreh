"use client";

import React from "react";
import { Button, Card, CardBody, Skeleton } from "@loyalty/ui";
import Toggle from "../../../../components/Toggle";

function normalizeInt(value: string, fallback = 0) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export default function RedeemLimitsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [banner, setBanner] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const [ttlEnabled, setTtlEnabled] = React.useState(false);
  const [ttlDays, setTtlDays] = React.useState("365");
  const [allowSameReceipt, setAllowSameReceipt] = React.useState(false);
  const [delayEnabled, setDelayEnabled] = React.useState(false);
  const [delayDays, setDelayDays] = React.useState("7");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    setBanner(null);
    try {
      const res = await fetch('/api/portal/loyalty/redeem-limits');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTtlEnabled(Boolean(data?.ttlEnabled));
      setTtlDays(String(Number(data?.ttlDays ?? 0) || 0));
      // API возвращает forbidSameReceipt; в UI показываем allowSameReceipt
      setAllowSameReceipt(!Boolean(data?.forbidSameReceipt));
      setDelayEnabled(Boolean(data?.delayEnabled));
      setDelayDays(String(Number(data?.delayDays ?? 0) || 0));
    } catch (e: any) {
      setError(String(e?.message || e || 'Не удалось загрузить настройки'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setBanner(null);

    const ttlValue = normalizeInt(ttlDays, 0);
    if (ttlEnabled && ttlValue <= 0) {
      setError('Срок жизни баллов должен быть положительным');
      return;
    }

    const delayValue = normalizeInt(delayDays, 0);
    if (delayEnabled && delayValue <= 0) {
      setError('Задержка должна быть положительным числом дней');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/portal/loyalty/redeem-limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ttlEnabled,
          ttlDays: ttlValue,
          // API ожидает forbidSameReceipt — инвертируем локальную настройку allowSameReceipt
          forbidSameReceipt: !allowSameReceipt,
          delayEnabled,
          delayDays: delayValue,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBanner({ type: 'success', text: 'Настройки сохранены' });
    } catch (e: any) {
      setError(String(e?.message || e || 'Не удалось сохранить настройки'));
    } finally {
      setSaving(false);
    }
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
        <div style={{ fontSize: 13, opacity: 0.7 }}>Настройте срок жизни баллов и запреты на одновременные операции</div>
      </div>

      <Card>
        <CardBody>
          <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
            Здесь задаются системные ограничения для начисленных баллов: срок жизни, правила единовременного использования и задержки на их активацию. Клиент увидит эти условия в приложении и кассир — в рабочем месте.
          </div>
        </CardBody>
      </Card>

      {banner && (
        <div
          style={{
            borderRadius: 12,
            padding: '12px 16px',
            border: `1px solid ${banner.type === 'success' ? 'rgba(34,197,94,.35)' : 'rgba(248,113,113,.35)'}`,
            background: banner.type === 'success' ? 'rgba(34,197,94,.15)' : 'rgba(248,113,113,.16)',
            color: banner.type === 'success' ? '#4ade80' : '#f87171',
          }}
        >
          {banner.text}
        </div>
      )}
      {error && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(248,113,113,.35)', padding: '12px 16px', color: '#f87171' }}>
          {error}
        </div>
      )}

      <Card>
        <CardBody>
          {loading ? (
            <Skeleton height={220} />
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
              <section style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <Toggle
                    checked={ttlEnabled}
                    onChange={setTtlEnabled}
                    label={ttlEnabled ? 'Сгорать через фиксированный срок' : 'Баллы бессрочные'}
                    title="Срок жизни начисленных баллов"
                    disabled={saving}
                  />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Срок действия начисленных баллов. После истечения — баллы сгорают.</span>
                </div>
                {ttlEnabled && (
                  <label style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
                    <span>Через сколько дней баллы за покупки сгорят</span>
                    <input
                      type="number"
                      min="1"
                      value={ttlDays}
                      onChange={(event) => setTtlDays(event.target.value)}
                      disabled={saving}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                    />
                  </label>
                )}
              </section>

              <section style={{ display: 'grid', gap: 12 }}>
                <Toggle
                  checked={allowSameReceipt}
                  onChange={setAllowSameReceipt}
                  label="Разрешить списывать и начислять баллы одновременно в чеке"
                  disabled={saving}
                />
                <span style={{ fontSize: 12, opacity: 0.7 }}>При включении после списания баллов клиенту начисляются баллы на оплаченную сумму по этому же заказу.</span>
              </section>

              <section style={{ display: 'grid', gap: 12 }}>
                <Toggle
                  checked={delayEnabled}
                  onChange={setDelayEnabled}
                  label={delayEnabled ? 'Задержка перед использованием включена' : 'Без задержки'}
                  disabled={saving}
                />
                {delayEnabled && (
                  <label style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
                    <span>Баллы можно использовать через указанное количество дней</span>
                    <input
                      type="number"
                      min="1"
                      value={delayDays}
                      onChange={(event) => setDelayDays(event.target.value)}
                      disabled={saving}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.6)', color: '#e2e8f0' }}
                    />
                  </label>
                )}
              </section>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <Button variant="secondary" type="button" onClick={load} disabled={saving}>Сбросить</Button>
                <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
