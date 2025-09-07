'use client';

import { useState } from 'react';
import QrScanner from '../components/QrScanner';

type QuoteRedeemResp = {
  canRedeem?: boolean;
  discountToApply?: number;
  pointsToBurn?: number;
  finalPayable?: number;
  holdId?: string;
  message?: string;
};

type QuoteEarnResp = {
  canEarn?: boolean;
  pointsToEarn?: number;
  holdId?: string;
  message?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

export default function Page() {
  const [mode, setMode] = useState<'redeem' | 'earn'>('redeem');
  const [userToken, setUserToken] = useState<string>('user-1'); // сюда вставится отсканированный JWT
  const [orderId, setOrderId] = useState<string>('O-1');
  const [total, setTotal] = useState<number>(1000);
  const [eligibleTotal, setEligibleTotal] = useState<number>(1000);

  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  async function callQuote() {
    setBusy(true);
    setResult(null);
    setHoldId(null);
    try {
      const r = await fetch(`${API_BASE}/loyalty/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, userToken, orderId, total, eligibleTotal }),
      });
      const data = await r.json();
      setResult(data);
      setHoldId((data as any).holdId ?? null);
    } catch (e: any) {
      alert('Ошибка запроса: ' + e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function callCommit() {
    if (!holdId) return alert('Сначала сделайте расчёт (QUOTE).');
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/loyalty/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holdId, orderId, receiptNumber: '000001' }),
      });
      const data = await r.json();
      if (data?.ok) {
        alert('Операция зафиксирована.');
        setHoldId(null);
        setResult(null);
        setOrderId('O-' + Math.floor(Math.random() * 100000));
      } else {
        alert('Commit вернул неуспех: ' + JSON.stringify(data));
      }
    } catch (e: any) {
      alert('Ошибка commit: ' + e?.message);
    } finally {
      setBusy(false);
    }
  }

  function onScan(text: string) {
    // В QR лежит JWT токен — подставим в поле клиента и сразу посчитаем
    setUserToken(text);
    setScanOpen(false);
    // авто-QUOTE
    setTimeout(() => { callQuote(); }, 100);
  }

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Виртуальный терминал кассира</h1>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Клиент (userToken/сканер):
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder="сканируй QR или вставь токен"
              style={{ flex: 1, padding: 8 }}
            />
            <button onClick={() => setScanOpen(true)} style={{ padding: '8px 12px' }}>
              Сканировать QR
            </button>
          </div>
        </label>

        <label>
          Номер заказа:
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ width: '100%', padding: 8 }}
          />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>
            Сумма чека (total):
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(+e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
          <label style={{ flex: 1 }}>
            База (eligibleTotal):
            <input
              type="number"
              value={eligibleTotal}
              onChange={(e) => setEligibleTotal(+e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>

        <div>
          Режим:&nbsp;
          <label>
            <input type="radio" name="mode" checked={mode === 'redeem'} onChange={() => setMode('redeem')} /> Списать
          </label>
          &nbsp;&nbsp;
          <label>
            <input type="radio" name="mode" checked={mode === 'earn'} onChange={() => setMode('earn')} /> Начислить
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={callQuote} disabled={busy} style={{ padding: '8px 16px' }}>
            Посчитать (QUOTE)
          </button>
          <button onClick={callCommit} disabled={busy || !holdId} style={{ padding: '8px 16px' }}>
            Оплачено (COMMIT)
          </button>
        </div>

        {result && (
          <pre style={{ background: '#f6f6f6', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {holdId && <div>Текущий holdId: <code>{holdId}</code></div>}
      </div>

      {scanOpen && <div style={{ marginTop: 20 }}><QrScanner onResult={onScan} onClose={() => setScanOpen(false)} /></div>}

      <p style={{ marginTop: 24, color: '#666' }}>
        Камера работает на <code>http://localhost</code> без HTTPS. Если открываешь с другого IP — понадобится HTTPS.
      </p>
    </main>
  );
}
