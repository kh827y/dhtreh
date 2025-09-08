'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const QR_TTL = Number(process.env.NEXT_PUBLIC_QR_TTL || '60');
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

declare global {
  interface Window { Telegram?: any; }
}

type Txn = {
  id: string;
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'ADJUST';
  amount: number;         // + начисление, - списание
  orderId: string | null;
  createdAt: string;      // ISO
};

export default function MiniApp() {
  const [customerId, setCustomerId] = useState<string>('user-1'); // fallback для браузера
  const [balance, setBalance] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // История
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [initLoaded, setInitLoaded] = useState(false);

  // Получаем userId из Telegram, если доступен
  useEffect(() => {
    try {
      const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgUserId) setCustomerId(String(tgUserId));
    } catch {}
  }, []);

  async function refreshBalance(id: string) {
    const r = await fetch(`${API}/loyalty/balance/${MERCHANT}/${encodeURIComponent(id)}`);
    const data = await r.json();
    setBalance(data.balance ?? 0);
  }

  async function makeQr() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/loyalty/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, ttlSec: QR_TTL, merchantId: MERCHANT }), // <— добавили merchantId
      });
      const { token } = await r.json();
      const qr = await QRCode.toDataURL(token, { margin: 1, width: 240 });
      setQrDataUrl(qr);
      setExpiresAt(Date.now() + QR_TTL * 1000);
    } catch (e: any) {
      alert('Ошибка выдачи QR: ' + e?.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTxns(reset = false) {
    if (loadingTx) return;
    setLoadingTx(true);
    try {
      const url = new URL(`${API}/loyalty/transactions`);
      url.searchParams.set('merchantId', MERCHANT);
      url.searchParams.set('customerId', customerId);
      url.searchParams.set('limit', '20');
      if (!reset && nextBefore) url.searchParams.set('before', nextBefore);

      const r = await fetch(url.toString());
      const data = await r.json();
      const items: Txn[] = data.items ?? [];
      setTxns(old => reset ? items : [...old, ...items]);
      setNextBefore(data.nextBefore ?? null);
    } catch (e: any) {
      alert('Ошибка истории: ' + e?.message);
    } finally {
      setLoadingTx(false);
      setInitLoaded(true);
    }
  }

  // первичная загрузка баланса и истории
  useEffect(() => {
    refreshBalance(customerId);
    setTxns([]); setNextBefore(null); setInitLoaded(false);
    loadTxns(true);
  }, [customerId]);

  const expSecondsLeft = useMemo(() => Math.max(0, Math.ceil((expiresAt - Date.now())/1000)), [expiresAt, qrDataUrl]);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setExpiresAt(x => x), 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  function typeLabel(t: Txn['type']) {
    if (t === 'EARN') return 'Начисление';
    if (t === 'REDEEM') return 'Списание';
    if (t === 'REFUND') return 'Возврат';
    return t;
  }

  function amountLabel(t: Txn) {
    const sign = t.amount > 0 ? '+' : '';
    return `${sign}${t.amount} ₽`;
  }

  return (
    <main style={{ maxWidth: 460, margin: '24px auto', fontFamily: 'system-ui, Arial', padding: 12 }}>
      {/* SDK Telegram */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <h2>Моя карта лояльности</h2>

      <div style={{ marginTop: 8, color: '#666' }}>
        Клиент: <code>{customerId}</code> · Мерчант: <code>{MERCHANT}</code>
      </div>

      <div style={{ marginTop: 12, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
        Баланс: <b>{balance} ₽</b>
        <button onClick={() => refreshBalance(customerId)} style={{ padding: '4px 8px' }}>
          Обновить
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={makeQr} disabled={loading} style={{ padding: '10px 16px' }}>
          Показать QR для оплаты
        </button>
      </div>

      {qrDataUrl && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <img src={qrDataUrl} alt="QR" />
          <div style={{ marginTop: 8, color: '#666' }}>
            Истекает через {expSecondsLeft} сек
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
            (QR несёт краткоживущий токен; касса сканирует → сервер считает скидку/списание)
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 28 }}>История операций</h3>
      {!initLoaded && <div style={{ color: '#666' }}>Загрузка...</div>}

      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {txns.map(tx => (
          <div key={tx.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b>{typeLabel(tx.type)}</b></div>
              <div>{new Date(tx.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 4 }}>
              Сумма: <b>{amountLabel(tx)}</b>
              {tx.orderId ? <span style={{ marginLeft: 10, color: '#666' }}>Заказ: {tx.orderId}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        {nextBefore ? (
          <button onClick={() => loadTxns(false)} disabled={loadingTx} style={{ padding: '8px 12px' }}>
            Показать ещё
          </button>
        ) : (
          initLoaded && <div style={{ color: '#666' }}>Это всё ✨</div>
        )}
      </div>
    </main>
  );
}
