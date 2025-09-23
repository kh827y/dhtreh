'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ReviewPrompt } from '../../components/ReviewPrompt';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
// TTL по умолчанию, перезапишем настройками мерчанта
const DEFAULT_QR_TTL = Number(process.env.NEXT_PUBLIC_QR_TTL || '60');
const DEFAULT_MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';

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
  const [merchantId, setMerchantId] = useState<string>(DEFAULT_MERCHANT);
  const [customerId, setCustomerId] = useState<string>('user-1'); // fallback для браузера
  const [balance, setBalance] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [qrTtlSec, setQrTtlSec] = useState<number>(DEFAULT_QR_TTL);
  const [autoRefreshTimer, setAutoRefreshTimer] = useState<any>(null);
  const [lastTtlSec, setLastTtlSec] = useState<number>(DEFAULT_QR_TTL);
  const [consent, setConsent] = useState<boolean>(false);
  const [themePrimary, setThemePrimary] = useState<string | null>(null);
  const [themeBg, setThemeBg] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // История
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [initLoaded, setInitLoaded] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState<{ visible: boolean; txnId?: string }>({ visible: false });
  const [reviewedTxnIds, setReviewedTxnIds] = useState<string[]>([]);

  // Определяем merchantId: Telegram start_param -> ?merchantId= -> путь -> env
  useEffect(() => {
    try {
      const wa = (window as any)?.Telegram?.WebApp;
      const sp = wa?.initDataUnsafe?.start_param;
      if (sp) setMerchantId(String(sp));
    } catch {}
    try {
      const q = new URLSearchParams(window.location.search).get('merchantId');
      if (q) setMerchantId(q);
    } catch {}
    try {
      const seg = (window.location.pathname || '').split('/').filter(Boolean).pop();
      if (seg && /^M-/.test(seg)) setMerchantId(seg);
    } catch {}
  }, []);

  // Telegram auth через initData (сервер проверяет подпись)
  useEffect(() => {
    (async () => {
      try {
        const initData = (window as any)?.Telegram?.WebApp?.initData;
        if (initData) {
          const r = await fetch(`${API}/loyalty/teleauth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData, merchantId }) });
          if (r.ok) {
            const data = await r.json();
            if (data?.customerId) setCustomerId(data.customerId);
          }
        }
      } catch {}
    })();
  }, [merchantId]);

  async function refreshBalance(id: string) {
    const r = await fetch(`${API}/loyalty/balance/${merchantId}/${encodeURIComponent(id)}`);
    const data = await r.json();
    setBalance(data.balance ?? 0);
  }

  async function makeQr() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/loyalty/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, ttlSec: qrTtlSec, merchantId, initData: (window as any)?.Telegram?.WebApp?.initData || undefined }),
      });
      const { token, ttl } = await r.json();
      const qr = await QRCode.toDataURL(token, { margin: 1, width: 240 });
      setQrDataUrl(qr);
      const effTtl = typeof ttl === 'number' && ttl > 0 ? ttl : qrTtlSec;
      setExpiresAt(Date.now() + effTtl * 1000);
      setLastTtlSec(effTtl);
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
      url.searchParams.set('merchantId', merchantId);
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

  useEffect(() => {
    if (!txns.length) return;
    const latest = txns[0];
    if (!latest) return;
    const eligible = latest.type === 'EARN' || latest.type === 'REDEEM';
    if (!eligible) return;
    if (reviewedTxnIds.includes(latest.id)) return;
    setReviewPrompt({ visible: true, txnId: latest.id });
    setReviewedTxnIds((prev) => prev.includes(latest.id) ? prev : [...prev, latest.id]);
  }, [txns, reviewedTxnIds]);

  // подгружаем настройки мерчанта (qrTtlSec, темы/логотип)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/loyalty/settings/${merchantId}`);
        const data = await r.json();
        if (data?.qrTtlSec) setQrTtlSec(data.qrTtlSec);
        setThemePrimary(data?.miniappThemePrimary ?? null);
        setThemeBg(data?.miniappThemeBg ?? null);
        setLogoUrl(data?.miniappLogoUrl ?? null);
      } catch {}
    })();
  }, [merchantId]);

  // загрузка согласия
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/loyalty/consent?merchantId=${encodeURIComponent(merchantId)}&customerId=${encodeURIComponent(customerId)}`);
        const data = await r.json();
        setConsent(Boolean(data?.granted));
      } catch {}
    })();
  }, [customerId, merchantId]);

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

  // автообновление QR за 2/3 TTL
  useEffect(() => {
    if (!expiresAt || !qrDataUrl) return;
    const refreshDelay = Math.max(1000, Math.floor((lastTtlSec * 1000) * 2 / 3));
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    const timer = setTimeout(() => { makeQr(); }, refreshDelay);
    setAutoRefreshTimer(timer);
    return () => clearTimeout(timer);
  }, [qrDataUrl, expiresAt, lastTtlSec]);

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
    <main style={{ maxWidth: 460, margin: '24px auto', fontFamily: 'system-ui, Arial', padding: 12, background: themeBg || undefined, borderRadius: 12 }}>
      {/* SDK Telegram */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <h2 style={{ color: themePrimary || undefined, display: 'flex', alignItems: 'center', gap: 8 }}>
        {logoUrl ? <img src={logoUrl} alt="logo" style={{ height: 28 }} /> : null}
        Моя карта лояльности
      </h2>

      <div style={{ marginTop: 8, color: '#666' }}>
        Клиент: <code>{customerId}</code> · Мерчант: <code>{merchantId}</code>
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

      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input id="consent" type="checkbox" checked={consent} onChange={async (e) => {
          const v = e.target.checked;
          setConsent(v);
          try {
            await fetch(`${API}/loyalty/consent`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ merchantId, customerId, granted: v })
            });
          } catch {}
        }} />
        <label htmlFor="consent">Я согласен получать уведомления о бонусах и предложениях</label>
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
      <ReviewPrompt
        visible={reviewPrompt.visible}
        transactionId={reviewPrompt.txnId}
        onClose={() => setReviewPrompt({ visible: false })}
        onSubmit={(rating, comment) => {
          console.log('Review submitted', { rating, comment, transactionId: reviewPrompt.txnId });
          alert('Спасибо за отзыв!');
          setReviewPrompt({ visible: false });
        }}
      />
    </main>
  );
}
