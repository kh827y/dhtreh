"use client";
import { useEffect, useMemo, useState } from 'react';
import { getSettings } from '../../../lib/admin';

export default function QrPage() {
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [miniappUrl, setMiniappUrl] = useState<string>('');

  useEffect(() => {
    getSettings(merchantId).then(s => {
      const username = (s.telegramBotUsername || '').replace(/^@/, '');
      const base = username ? `https://t.me/${username}/startapp` : 'https://t.me';
      const link = s.miniappBaseUrl ? s.miniappBaseUrl : `${base}?startapp=${encodeURIComponent(merchantId)}`;
      setMiniappUrl(link);
    });
  }, [merchantId]);

  const qrUrl = useMemo(() => miniappUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(miniappUrl)}` : '', [miniappUrl]);

  const doPrint = () => window.print();

  return (
    <div>
      <h3>Шаг 4. QR для печати</h3>
      {miniappUrl && (
        <div>
          <div style={{ marginBottom: 12 }}>Deep link мини‑аппы: <a href={miniappUrl} target="_blank" rel="noreferrer">{miniappUrl}</a></div>
          <div style={{ border: '1px solid #ddd', width: 320, padding: 10 }}>
            <img src={qrUrl} width={300} height={300} alt="QR" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>Сканируйте для участия в программе</div>
          </div>
          <button onClick={doPrint} style={{ marginTop: 12 }}>Печать</button>
        </div>
      )}
    </div>
  );
}
