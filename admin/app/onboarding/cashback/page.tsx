"use client";
import { useEffect, useState } from 'react';
import { getSettings, updateSettings, type MerchantSettings } from '../../../lib/admin';

export default function CashbackPage() {
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [s, setS] = useState<MerchantSettings | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { getSettings(merchantId).then(setS).catch(e=>setMsg(String(e?.message||e))); }, [merchantId]);

  const save = async () => {
    if (!s) return; setMsg('');
    try {
      const res = await updateSettings(merchantId, { earnBps: s.earnBps, redeemLimitBps: s.redeemLimitBps, qrTtlSec: s.qrTtlSec });
      setS(res); setMsg('Сохранено');
    } catch (e:any) { setMsg('Ошибка: ' + (e.message || e)); }
  };

  return (
    <div>
      <h3>Шаг 3. Процент кэшбека</h3>
      {s && (
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <label>Кэшбек (bps): <input type="number" value={s.earnBps} onChange={e=>setS({ ...s, earnBps: parseInt(e.target.value||'500',10) })} /></label>
          <label>Лимит списания (bps): <input type="number" value={s.redeemLimitBps} onChange={e=>setS({ ...s, redeemLimitBps: parseInt(e.target.value||'5000',10) })} /></label>
          <label>TTL QR (сек): <input type="number" value={s.qrTtlSec} onChange={e=>setS({ ...s, qrTtlSec: parseInt(e.target.value||'120',10) })} /></label>
          <button onClick={save}>Сохранить</button>
        </div>
      )}
      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
