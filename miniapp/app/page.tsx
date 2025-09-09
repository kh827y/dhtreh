"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import QrCanvas from '../components/QrCanvas';
import { balance, consentGet, consentSet, mintQr, publicSettings, teleauth, transactions } from '../lib/api';

type TgWebApp = { initData?: string; initDataUnsafe?: any };

function getInitData(): string | null {
  try {
    const tg = (window as any)?.Telegram?.WebApp as TgWebApp | undefined;
    if (tg?.initData) return tg.initData;
    const p = new URLSearchParams(window.location.search);
    return p.get('initData') || p.get('tgWebAppData') || p.get('tg_init_data');
  } catch { return null; }
}

export default function Page() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [qrToken, setQrToken] = useState<string>('');
  const [ttl, setTtl] = useState<number>(Number(process.env.NEXT_PUBLIC_QR_TTL || '60'));
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<Array<{ id: string; type: string; amount: number; createdAt: string }>>([]);
  const [consent, setConsent] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem('miniapp.customerId');
    if (saved) setCustomerId(saved);
    const id = getInitData();
    if (id && merchantId) {
      teleauth(merchantId, id)
        .then((r) => { setCustomerId(r.customerId); localStorage.setItem('miniapp.customerId', r.customerId); setStatus('Авторизовано через Telegram'); })
        .catch((e) => setStatus(`Ошибка авторизации: ${e.message || e}`));
    }
    // подтянем рекомендуемый TTL
    publicSettings(merchantId).then(s => setTtl(s.qrTtlSec)).catch(() => {});
  }, [merchantId]);

  const doMint = useCallback(async () => {
    if (!customerId) { setStatus('Сначала авторизуйтесь'); return; }
    try {
      const r = await mintQr(customerId, merchantId, ttl);
      setQrToken(r.token);
      setStatus(`QR сгенерирован, TTL ${r.ttl}s`);
    } catch (e: any) { setStatus(`Ошибка генерации QR: ${e.message || e}`); }
  }, [customerId, merchantId, ttl]);

  const loadBalance = useCallback(async () => {
    if (!customerId) { setStatus('Нет customerId'); return; }
    try { const r = await balance(merchantId, customerId); setBal(r.balance); setStatus('Баланс обновлён'); }
    catch (e: any) { setStatus(`Ошибка баланса: ${e.message || e}`); }
  }, [customerId, merchantId]);

  const loadTx = useCallback(async () => {
    if (!customerId) { setStatus('Нет customerId'); return; }
    try { const r = await transactions(merchantId, customerId, 20); setTx(r.items.map(i => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt }))); setStatus('История обновлена'); }
    catch (e: any) { setStatus(`Ошибка истории: ${e.message || e}`); }
  }, [customerId, merchantId]);

  const syncConsent = useCallback(async () => {
    if (!customerId) return;
    try { const r = await consentGet(merchantId, customerId); setConsent(!!r.granted); } catch {}
  }, [customerId, merchantId]);

  useEffect(() => { if (customerId) syncConsent(); }, [customerId, syncConsent]);

  const toggleConsent = useCallback(async () => {
    if (!customerId) return;
    try { await consentSet(merchantId, customerId, !consent); setConsent(!consent); setStatus('Согласие обновлено'); } catch (e: any) { setStatus(`Ошибка согласия: ${e.message || e}`); }
  }, [merchantId, customerId, consent]);

  return (
    <div>
      <h1 style={{ margin: '8px 0 16px' }}>Программа лояльности</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <label>
          Мерчант:
          <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        <label>
          TTL QR (сек):
          <input type="number" min={10} max={600} value={ttl} onChange={e=>setTtl(parseInt(e.target.value||'60',10))} style={{ marginLeft: 8, width: 90 }} />
        </label>
        <label>
          CustomerId:
          <input value={customerId || ''} onChange={e=>{ setCustomerId(e.target.value); localStorage.setItem('miniapp.customerId', e.target.value); }} placeholder="teleauth заполнит сам" style={{ marginLeft: 8, width: 220 }} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={doMint} style={{ padding: '8px 12px' }}>Показать QR</button>
        <button onClick={loadBalance} style={{ padding: '8px 12px' }}>Обновить баланс</button>
        <button onClick={loadTx} style={{ padding: '8px 12px' }}>История</button>
        <button onClick={toggleConsent} style={{ padding: '8px 12px' }}>{consent ? 'Отозвать согласие' : 'Дать согласие'}</button>
      </div>

      {status && <div style={{ margin: '8px 0', opacity: 0.9 }}>{status}</div>}

      {qrToken && (
        <div style={{ background: '#0e1629', padding: 12, borderRadius: 8, margin: '16px 0' }}>
          <div style={{ marginBottom: 8 }}>Покажите QR кассиру для сканирования</div>
          <QrCanvas value={qrToken} />
          <div style={{ wordBreak: 'break-all', fontSize: 12, opacity: 0.7, marginTop: 8 }}>JWT: {qrToken}</div>
        </div>
      )}

      {bal != null && (
        <div style={{ marginTop: 8 }}>Баланс: <b>{bal}</b> баллов</div>
      )}

      {tx.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>Последние операции:</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {tx.map(item => (
              <div key={item.id} style={{ background: '#0e1629', padding: 8, borderRadius: 6 }}>
                <div>{item.type} {item.amount >= 0 ? '+' : ''}{item.amount}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>{new Date(item.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

