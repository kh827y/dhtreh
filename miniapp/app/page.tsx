"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import QrCanvas from '../components/QrCanvas';
import { balance, consentGet, consentSet, mintQr, publicSettings, teleauth, transactions } from '../lib/api';

type TgWebApp = { initData?: string; initDataUnsafe?: any };

const DEV_UI = (process.env.NEXT_PUBLIC_MINIAPP_DEV_UI || '').toLowerCase() === 'true' || process.env.NEXT_PUBLIC_MINIAPP_DEV_UI === '1';

function getInitData(): string | null {
  try {
    const tg = (window as any)?.Telegram?.WebApp as TgWebApp | undefined;
    if (tg?.initData) return tg.initData;
    const p = new URLSearchParams(window.location.search);
    return p.get('initData') || p.get('tgWebAppData') || p.get('tg_init_data');
  } catch { return null; }
}

function getMerchantFromContext(initData: string | null): string | undefined {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromQuery = q.get('merchantId') || undefined;
    if (fromQuery) return fromQuery;
    if (initData) {
      const u = new URLSearchParams(initData);
      const sp = u.get('start_param') || u.get('startapp');
      if (sp) return sp;
    }
  } catch {}
  return undefined;
}

export default function Page() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [qrToken, setQrToken] = useState<string>('');
  const [ttl, setTtl] = useState<number>(Number(process.env.NEXT_PUBLIC_QR_TTL || '60'));
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<Array<{ id: string; type: string; amount: number; createdAt: string }>>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [consent, setConsent] = useState<boolean>(false);
  const [theme, setTheme] = useState<{ primary?: string|null; bg?: string|null; logo?: string|null }>({});

  useEffect(() => {
    const saved = localStorage.getItem('miniapp.customerId');
    if (saved) setCustomerId(saved);
    const id = getInitData();
    const ctxMerchant = getMerchantFromContext(id);
    if (ctxMerchant) setMerchantId(ctxMerchant);
    if (id && (ctxMerchant || merchantId)) {
      teleauth(ctxMerchant || merchantId, id)
        .then((r) => { setCustomerId(r.customerId); localStorage.setItem('miniapp.customerId', r.customerId); setStatus('Авторизовано через Telegram'); })
        .catch((e) => setStatus(`Ошибка авторизации: ${e.message || e}`));
    }
    // подтянем рекомендуемый TTL
    publicSettings(ctxMerchant || merchantId).then(s => { setTtl(s.qrTtlSec); setTheme({ primary: s.miniappThemePrimary, bg: s.miniappThemeBg, logo: s.miniappLogoUrl }); }).catch(() => {});
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
    try {
      const r = await transactions(merchantId, customerId, 20);
      setTx(r.items.map(i => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt })));
      setNextBefore(r.nextBefore || null);
      setStatus('История обновлена');
    }
    catch (e: any) { setStatus(`Ошибка истории: ${e.message || e}`); }
  }, [customerId, merchantId]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx(prev => [...prev, ...r.items.map(i => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt }))]);
      setNextBefore(r.nextBefore || null);
    } catch (e:any) { setStatus(`Ошибка подгрузки: ${e.message || e}`); }
  }, [merchantId, customerId, nextBefore]);

  useEffect(() => {
    if (!qrToken || !autoRefresh) return;
    const id = setTimeout(() => { doMint().catch(()=>{}); }, Math.max(5, (ttl - 5)) * 1000);
    return () => clearTimeout(id);
  }, [qrToken, autoRefresh, ttl, doMint]);

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
    <div style={{ background: theme.bg || '#0b1220', color: '#e6edf3', minHeight: '100vh', margin: -16, padding: 16 }}>
      <h1 style={{ margin: '8px 0 16px' }}>Программа лояльности</h1>
      {theme.logo && (
        <div style={{ margin: '8px 0' }}>
          <img src={theme.logo} alt="logo" style={{ maxHeight: 48 }} />
        </div>
      )}
      {DEV_UI && (
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
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={doMint} style={{ padding: '8px 12px', background: theme.primary || '#4f46e5', border: 'none', color: '#fff', borderRadius: 6 }}>Показать QR</button>
        {DEV_UI && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} /> авто‑обновлять QR
          </label>
        )}
        <button onClick={loadBalance} style={{ padding: '8px 12px' }}>Обновить баланс</button>
        <button onClick={loadTx} style={{ padding: '8px 12px' }}>История</button>
        <button onClick={toggleConsent} style={{ padding: '8px 12px' }}>{consent ? 'Отозвать согласие' : 'Дать согласие'}</button>
      </div>

      {status && <div style={{ margin: '8px 0', opacity: 0.9 }}>{status}</div>}

      {qrToken ? (
        <div style={{ background: '#0e1629', padding: 12, borderRadius: 8, margin: '16px 0' }}>
          <div style={{ marginBottom: 8 }}>Покажите QR кассиру для сканирования</div>
          <QrCanvas value={qrToken} />
          <div style={{ wordBreak: 'break-all', fontSize: 12, opacity: 0.7, marginTop: 8 }}>JWT: {qrToken}</div>
        </div>
      ) : (
        <div style={{ margin: '16px 0', opacity: 0.8 }}>QR ещё не сгенерирован</div>
      )}

      {bal != null && (
        <div style={{ marginTop: 8 }}>Баланс: <b>{bal}</b> баллов</div>
      )}

      {tx.length > 0 ? (
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
          {nextBefore && (
            <div style={{ marginTop: 8 }}>
              <button onClick={loadMore} style={{ padding: '6px 10px' }}>Показать ещё</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 16, opacity: 0.8 }}>Операций пока нет</div>
      )}
    </div>
  );
}
