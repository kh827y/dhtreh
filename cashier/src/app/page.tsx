'use client';

import { useEffect, useRef, useState } from 'react';
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
type Txn = { id: string; type: 'EARN'|'REDEEM'|'REFUND'|'ADJUST'; amount: number; orderId?: string|null; createdAt: string };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

export default function Page() {
  const [merchantId] = useState<string>(MERCHANT);

  const [mode, setMode] = useState<'redeem' | 'earn'>('redeem');
  const [userToken, setUserToken] = useState<string>('user-1'); // сюда вставится отсканированный JWT
  const [orderId, setOrderId] = useState<string>('O-1');
  const [total, setTotal] = useState<number>(1000);
  const [eligibleTotal, setEligibleTotal] = useState<number>(1000);

  const [holdId, setHoldId] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteRedeemResp | QuoteEarnResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // refund UI
  const [refundOrderId, setRefundOrderId] = useState<string>('O-1');
  const [refundTotal, setRefundTotal] = useState<number>(0);

  // history UI
  const [history, setHistory] = useState<Txn[]>([]);
  const [histBusy, setHistBusy] = useState(false);
  const [histNextBefore, setHistNextBefore] = useState<string | null>(null);

  // Сгенерируем уникальный orderId при первом монтировании, чтобы избежать идемпотентных коллизий после перезагрузки
  useEffect(() => {
    setOrderId('O-' + Math.floor(Date.now() % 1_000_000));
  }, []);

  async function callQuote() {
    setBusy(true);
    setResult(null);
    setHoldId(null);
    try {
      const r = await fetch(`${API_BASE}/loyalty/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, mode, userToken, orderId, total, eligibleTotal }),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || r.statusText);
      }
      const data = await r.json();
      setResult(data);
      setHoldId((data as any).holdId ?? null);
    } catch (e: any) {
      const msg = String(e?.message || e);
      // гарантированно закрываем модалку, если вдруг ещё открыта
      setScanOpen(false);

      if (msg.includes('QR токен уже использован')) {
        alert('Этот QR уже использован. Попросите клиента обновить QR в мини-аппе.');
      } else if (msg.includes('ERR_JWT_EXPIRED') || msg.includes('JWTExpired') || msg.includes('"exp"')) {
        alert('QR истёк по времени. Попросите клиента обновить QR в мини-аппе и отсканируйте заново.');
      } else if (msg.includes('другого мерчанта')) {
        alert('QR выписан для другого мерчанта.');
      } else {
        alert('Ошибка запроса: ' + msg);
      }
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
        body: JSON.stringify({ merchantId, holdId, orderId, receiptNumber: '000001' }),
      });
      const data = await r.json();
      if (data?.ok) {
        alert(data?.alreadyCommitted ? 'Операция уже была зафиксирована ранее (идемпотентно).' : 'Операция зафиксирована.');
        setHoldId(null);
        setResult(null);
        setOrderId('O-' + Math.floor(Math.random() * 100000));
        // не очищаем список сканирований — повторный скан того же QR должен блокироваться
      } else {
        alert('Commit вернул неуспех: ' + JSON.stringify(data));
      }
    } catch (e: any) {
      alert('Ошибка commit: ' + e?.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadBalance() {
    try {
      const r = await fetch(`${API_BASE}/loyalty/balance/${merchantId}/${encodeURIComponent(userToken)}`);
      const data = await r.json();
      alert(`Баланс клиента ${data.customerId} в мерчанте ${data.merchantId}: ${data.balance} ₽`);
    } catch (e: any) {
      alert('Ошибка получения баланса: ' + e?.message);
    }
  }

  // защита от повторных onResult
  const scanHandledRef = useRef(false);
  // сбрасываем флаг только при открытии окна сканера
  useEffect(() => { if (scanOpen) scanHandledRef.current = false; }, [scanOpen]);
  // блок повторных сканов (храним ключи в sessionStorage, переживает HMR/обновления)
  const scannedTokensRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('scannedQrKeys_v1');
      if (raw) scannedTokensRef.current = new Set(JSON.parse(raw));
    } catch {}
  }, []);
  const saveScanned = () => {
    try { sessionStorage.setItem('scannedQrKeys_v1', JSON.stringify(Array.from(scannedTokensRef.current))); } catch {}
  };
  const base64UrlDecode = (s: string) => {
    try {
      s = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
      return atob(s + '='.repeat(pad));
    } catch { return ''; }
  };
  const extractQrKey = (text: string): string => {
    const t = (text || '').trim();
    const parts = t.split('.');
    if (parts.length === 3) {
      try { const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}'); if (payload?.jti) return `jti:${payload.jti}`; } catch {}
    }
    return `raw:${t}`;
  };

  function onScan(text: string) {
    // первым делом ставим флаг, чтобы отсечь повторные вызовы в этом открытии
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    // закрываем окно сканера до любых alert, чтобы не ловить лавину повторов
    setScanOpen(false);
    // если этот же токен уже сканировался — показываем одно предупреждение
    const key = extractQrKey(text);
    if (scannedTokensRef.current.has(key)) {
      alert('Этот QR уже сканирован. Попросите клиента обновить QR в мини-аппе.');
      return;
    }
    scannedTokensRef.current.add(key); saveScanned();
    // Всегда подставляем считанный токен, чтобы кассир видел, что считано
    setUserToken(text);
    // авто-QUOTE
    setTimeout(() => { callQuote(); }, 100);
  }

  // ==== Refund ====
  async function doRefund() {
    if (!refundOrderId || refundTotal <= 0) return alert('Укажи orderId и сумму возврата (>0)');
    try {
      const r = await fetch(`${API_BASE}/loyalty/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, orderId: refundOrderId, refundTotal }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      alert(`Refund OK. share=${(data.share*100).toFixed(1)}%, +${data.pointsRestored} / -${data.pointsRevoked}`);
    } catch (e: any) {
      alert('Ошибка refund: ' + e?.message);
    }
  }

  // ==== История ====
  async function loadHistory(reset = false) {
    if (histBusy) return;
    setHistBusy(true);
    try {
      let customerId = userToken;
      if (userToken.split('.').length === 3) {
        const manual = prompt('Для истории нужен customerId (например, user-1). Введите его:');
        if (!manual) { setHistBusy(false); return; }
        customerId = manual;
      }
      const url = new URL(`${API_BASE}/loyalty/transactions`);
      url.searchParams.set('merchantId', merchantId);
      url.searchParams.set('customerId', customerId);
      url.searchParams.set('limit', '20');
      if (!reset && histNextBefore) url.searchParams.set('before', histNextBefore);
      const r = await fetch(url.toString());
      const data = await r.json();
      const items: Txn[] = data.items ?? [];
      setHistory(old => reset ? items : [...old, ...items]);
      setHistNextBefore(data.nextBefore ?? null);
    } catch (e: any) {
      alert('Ошибка истории: ' + e?.message);
    } finally {
      setHistBusy(false);
    }
  }

  useEffect(() => { setHistory([]); setHistNextBefore(null); }, [userToken, merchantId]);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Виртуальный терминал кассира</h1>
      <div style={{ color: '#666', marginTop: 6 }}>Мерчант: <code>{merchantId}</code></div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Клиент (userToken/сканер):
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder="сканируй QR или вставь токен"
              style={{ flex: 1, minWidth: 280, padding: 8 }}
            />
            <button onClick={() => setScanOpen(true)} disabled={scanOpen} style={{ padding: '8px 12px' }}>
              Сканировать QR
            </button>
            <button onClick={loadBalance} style={{ padding: '8px 12px' }}>
              Баланс
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
            <input type="number" value={total} onChange={(e) => setTotal(+e.target.value)} style={{ width: '100%', padding: 8 }} />
          </label>
          <label style={{ flex: 1 }}>
            База (eligibleTotal):
            <input type="number" value={eligibleTotal} onChange={(e) => setEligibleTotal(+e.target.value)} style={{ width: '100%', padding: 8 }} />
          </label>
        </div>

        <div>
          Режим:&nbsp;
          <label><input type="radio" name="mode" checked={mode === 'redeem'} onChange={() => setMode('redeem')} /> Списать</label>
          &nbsp;&nbsp;
          <label><input type="radio" name="mode" checked={mode === 'earn'} onChange={() => setMode('earn')} /> Начислить</label>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={callQuote} disabled={busy} style={{ padding: '8px 16px' }}>Посчитать (QUOTE)</button>
          <button onClick={callCommit} disabled={busy || !holdId} style={{ padding: '8px 16px' }}>Оплачено (COMMIT)</button>
        </div>

        {result && (
          <pre style={{ background: '#f6f6f6', padding: 12, overflow: 'auto' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {holdId && <div>Текущий holdId: <code>{holdId}</code></div>}
      </div>

      {scanOpen && <div style={{ marginTop: 20 }}><QrScanner onResult={onScan} onClose={() => setScanOpen(false)} /></div>}

      {/* Refund */}
      <h2 style={{ marginTop: 28 }}>Refund</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input value={refundOrderId} onChange={(e) => setRefundOrderId(e.target.value)} placeholder="orderId" style={{ padding: 8, flex: 1, minWidth: 220 }} />
        <input type="number" value={refundTotal} onChange={(e) => setRefundTotal(+e.target.value)} placeholder="refundTotal" style={{ padding: 8, width: 160 }} />
        <button onClick={doRefund} style={{ padding: '8px 16px' }}>Сделать возврат</button>
      </div>

      {/* History */}
      <h2 style={{ marginTop: 28 }}>История операций</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={() => loadHistory(true)} disabled={histBusy} style={{ padding: '6px 10px' }}>Загрузить</button>
        {histNextBefore && <button onClick={() => loadHistory(false)} disabled={histBusy} style={{ padding: '6px 10px' }}>Показать ещё</button>}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {history.map(h => (
          <div key={h.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{h.type}</b>
              <span>{new Date(h.createdAt).toLocaleString()}</span>
            </div>
            <div>Сумма: <b>{h.amount > 0 ? '+' : ''}{h.amount} ₽</b>{h.orderId ? ` · Заказ: ${h.orderId}` : ''}</div>
          </div>
        ))}
        {(!history.length && !histBusy) && <div style={{ color: '#666' }}>Нет данных</div>}
      </div>

      <p style={{ marginTop: 24, color: '#666' }}>
        Камера работает на <code>http://localhost</code> без HTTPS. Если открываешь с другого IP — понадобится HTTPS.
      </p>
    </main>
  );
}
