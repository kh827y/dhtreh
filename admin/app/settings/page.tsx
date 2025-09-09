"use client";
import { useEffect, useState } from 'react';
import { getSettings, updateSettings, type MerchantSettings } from '../../lib/admin';

function num(v: any, def: number | null = null): number | null {
  const n = parseInt(String(v || ''), 10);
  if (isNaN(n)) return def;
  return n;
}

export default function SettingsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [s, setS] = useState<MerchantSettings | null>(null);
  const [rules, setRules] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    getSettings(merchantId).then(r => {
      setS(r);
      setRules(r.rulesJson ? JSON.stringify(r.rulesJson, null, 2) : '');
    }).catch((e:any)=>setMsg(String(e?.message||e))).finally(()=>setLoading(false));
  }, [merchantId]);

  const save = async () => {
    if (!s) return;
    setLoading(true);
    try {
      let rulesJson: any = undefined;
      if (rules.trim()) {
        try { rulesJson = JSON.parse(rules); }
        catch (e:any) { setMsg('Некорректный JSON правил: ' + (e.message||e)); setLoading(false); return; }
      }
      const dto: any = {
        earnBps: s.earnBps,
        redeemLimitBps: s.redeemLimitBps,
        qrTtlSec: s.qrTtlSec,
        requireBridgeSig: !!s.requireBridgeSig,
        requireStaffKey: !!s.requireStaffKey,
        requireJwtForQuote: !!s.requireJwtForQuote,
        redeemCooldownSec: s.redeemCooldownSec,
        earnCooldownSec: s.earnCooldownSec,
        redeemDailyCap: s.redeemDailyCap ?? undefined,
        earnDailyCap: s.earnDailyCap ?? undefined,
        pointsTtlDays: s.pointsTtlDays ?? undefined,
        rulesJson,
      };
      const r = await updateSettings(merchantId, dto);
      setS(r);
      setMsg('Сохранено');
    } catch (e:any) { setMsg('Ошибка сохранения: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h2>Настройки мерчанта</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <label>
          Мерчант:
          <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        {loading && <span>Загрузка…</span>}
      </div>

      {s && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
          <div>
            <label>Начисление (bps):</label>
            <input type="number" min={0} max={10000} value={s.earnBps} onChange={e=>setS({ ...s, earnBps: num(e.target.value, s.earnBps) || 0 })} style={{ marginLeft: 8, width: 100 }} />
          </div>
          <div>
            <label>Лимит списания (bps):</label>
            <input type="number" min={0} max={10000} value={s.redeemLimitBps} onChange={e=>setS({ ...s, redeemLimitBps: num(e.target.value, s.redeemLimitBps) || 0 })} style={{ marginLeft: 8, width: 120 }} />
          </div>
          <div>
            <label>QR TTL (сек):</label>
            <input type="number" min={15} max={600} value={s.qrTtlSec} onChange={e=>setS({ ...s, qrTtlSec: num(e.target.value, s.qrTtlSec) || 120 })} style={{ marginLeft: 8, width: 100 }} />
          </div>
          <div>
            <label>Cooldown списаний (сек):</label>
            <input type="number" min={0} max={86400} value={s.redeemCooldownSec} onChange={e=>setS({ ...s, redeemCooldownSec: num(e.target.value, s.redeemCooldownSec) || 0 })} style={{ marginLeft: 8, width: 120 }} />
          </div>
          <div>
            <label>Cooldown начислений (сек):</label>
            <input type="number" min={0} max={86400} value={s.earnCooldownSec} onChange={e=>setS({ ...s, earnCooldownSec: num(e.target.value, s.earnCooldownSec) || 0 })} style={{ marginLeft: 8, width: 120 }} />
          </div>
          <div>
            <label>Дневной лимит списаний:</label>
            <input type="number" min={0} value={s.redeemDailyCap ?? 0} onChange={e=>setS({ ...s, redeemDailyCap: num(e.target.value, 0) || 0 })} style={{ marginLeft: 8, width: 140 }} />
          </div>
          <div>
            <label>Дневной лимит начислений:</label>
            <input type="number" min={0} value={s.earnDailyCap ?? 0} onChange={e=>setS({ ...s, earnDailyCap: num(e.target.value, 0) || 0 })} style={{ marginLeft: 8, width: 140 }} />
          </div>
          <div>
            <label>TTL баллов (дней):</label>
            <input type="number" min={0} value={s.pointsTtlDays ?? 0} onChange={e=>setS({ ...s, pointsTtlDays: num(e.target.value, 0) || 0 })} style={{ marginLeft: 8, width: 120 }} />
          </div>
          <div>
            <label>
              Требовать Staff‑Key
              <input type="checkbox" checked={!!s.requireStaffKey} onChange={e=>setS({ ...s, requireStaffKey: e.target.checked })} style={{ marginLeft: 8 }} />
            </label>
          </div>
          <div>
            <label>
              Требовать подпись Bridge
              <input type="checkbox" checked={!!s.requireBridgeSig} onChange={e=>setS({ ...s, requireBridgeSig: e.target.checked })} style={{ marginLeft: 8 }} />
            </label>
          </div>
          <div>
            <label>
              Требовать JWT для QUOTE
              <input type="checkbox" checked={!!s.requireJwtForQuote} onChange={e=>setS({ ...s, requireJwtForQuote: e.target.checked })} style={{ marginLeft: 8 }} />
            </label>
          </div>
          <div>
            <label>Правила (JSON):</label>
            <textarea value={rules} onChange={e=>setRules(e.target.value)} rows={10} style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }} placeholder='[ {"if": {"channelIn":["SMART"]}, "then": {"earnBps":700}} ]' />
          </div>
          <div><button onClick={save} disabled={loading} style={{ padding: '8px 12px' }}>Сохранить</button></div>
        </div>
      )}

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

