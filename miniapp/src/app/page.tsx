'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const QR_TTL = Number(process.env.NEXT_PUBLIC_QR_TTL || '60');

declare global {
  interface Window {
    Telegram?: any;
  }
}

export default function MiniApp() {
  const [customerId, setCustomerId] = useState<string>('user-1'); // fallback для браузера
  const [balance, setBalance] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // Попытка взять userId из Telegram WebApp, иначе оставим user-1
  useEffect(() => {
    try {
      const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (tgUserId) setCustomerId(String(tgUserId));
    } catch {}
  }, []);

  async function refreshBalance(id: string) {
    const r = await fetch(`${API}/loyalty/balance/${encodeURIComponent(id)}`);
    const data = await r.json();
    setBalance(data.balance ?? 0);
  }

  async function makeQr() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/loyalty/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, ttlSec: QR_TTL }),
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

  useEffect(() => { refreshBalance(customerId); }, [customerId]);

  const expSecondsLeft = useMemo(() => Math.max(0, Math.ceil((expiresAt - Date.now())/1000)), [expiresAt, qrDataUrl]);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => {
      // просто триггерим перерисовку
      setExpiresAt((x) => x);
    }, 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <main style={{ maxWidth: 420, margin: '24px auto', fontFamily: 'system-ui, Arial', padding: 12 }}>
      {/* SDK Telegram */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <h2>Моя карта лояльности</h2>

      <div style={{ marginTop: 8, color: '#666' }}>
        Клиент: <code>{customerId}</code>
      </div>

      <div style={{ marginTop: 12, fontSize: 18 }}>
        Баланс: <b>{balance} ₽</b>
        <button onClick={() => refreshBalance(customerId)} style={{ marginLeft: 12, padding: '4px 8px' }}>
          Обновить
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
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
    </main>
  );
}
