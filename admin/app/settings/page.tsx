"use client";
import { useEffect, useState } from 'react';
import { getSettings, updateSettings, previewRules, type MerchantSettings } from '../../lib/admin';

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
  const [rulesErrors, setRulesErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ channel: 'SMART'|'PC_POS'|'VIRTUAL'; weekday: number; eligibleTotal: number; category?: string }>({ channel: 'SMART', weekday: new Date().getDay(), eligibleTotal: 1000 });
  const [previewOut, setPreviewOut] = useState<{ earnBps: number; redeemLimitBps: number } | null>(null);
  const [serverPreviewOut, setServerPreviewOut] = useState<{ earnBps: number; redeemLimitBps: number } | null>(null);
  // локальные поля для секретов (не подставляем значения из API)
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookKeyId, setWebhookKeyId] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [webhookKeyIdNext, setWebhookKeyIdNext] = useState<string>('');
  const [webhookSecretNext, setWebhookSecretNext] = useState<string>('');
  const [useWebhookNext, setUseWebhookNext] = useState<boolean>(false);
  const [bridgeSecret, setBridgeSecret] = useState<string>('');
  const [bridgeSecretNext, setBridgeSecretNext] = useState<string>('');
  const [miniappThemePrimary, setMiniappThemePrimary] = useState<string>('');
  const [miniappThemeBg, setMiniappThemeBg] = useState<string>('');
  const [miniappLogoUrl, setMiniappLogoUrl] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    getSettings(merchantId).then(r => {
      setS(r);
      setRules(r.rulesJson ? JSON.stringify(r.rulesJson, null, 2) : '');
      setWebhookUrl(r.webhookUrl || '');
      setWebhookKeyId(r.webhookKeyId || '');
      setWebhookKeyIdNext(r.webhookKeyIdNext || '');
      setUseWebhookNext(!!r.useWebhookNext);
      setMiniappThemePrimary(r.miniappThemePrimary || '');
      setMiniappThemeBg(r.miniappThemeBg || '');
      setMiniappLogoUrl(r.miniappLogoUrl || '');
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
        const errs = validateRules(rulesJson);
        setRulesErrors(errs);
        if (errs.length) { setMsg('Исправьте ошибки правил перед сохранением'); setLoading(false); return; }
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
        webhookUrl: webhookUrl || undefined,
        webhookKeyId: webhookKeyId || undefined,
        webhookSecret: webhookSecret || undefined,
        webhookKeyIdNext: webhookKeyIdNext || undefined,
        webhookSecretNext: webhookSecretNext || undefined,
        useWebhookNext: useWebhookNext,
        bridgeSecret: bridgeSecret || undefined,
        bridgeSecretNext: bridgeSecretNext || undefined,
        miniappThemePrimary: miniappThemePrimary || undefined,
        miniappThemeBg: miniappThemeBg || undefined,
        miniappLogoUrl: miniappLogoUrl || undefined,
      };
      const r = await updateSettings(merchantId, dto);
      setS(r);
      setMsg('Сохранено');
      setWebhookSecret('');
      setWebhookSecretNext('');
      setBridgeSecret('');
      setBridgeSecretNext('');
    } catch (e:any) { setMsg('Ошибка сохранения: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  function validateRules(json: any): string[] {
    const errors: string[] = [];
    if (json == null || json === '') return errors;
    if (!Array.isArray(json)) { errors.push('Правила должны быть массивом объектов'); return errors; }
    json.forEach((item: any, idx: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`#${idx}: элемент должен быть объектом`); return; }
      const cond = item.if ?? {};
      const then = item.then ?? {};
      if (cond.channelIn && !Array.isArray(cond.channelIn)) errors.push(`#${idx}: if.channelIn должен быть массивом строк`);
      if (cond.weekdayIn && !Array.isArray(cond.weekdayIn)) errors.push(`#${idx}: if.weekdayIn должен быть массивом чисел 0..6`);
      if (cond.minEligible != null && (typeof cond.minEligible !== 'number' || cond.minEligible < 0)) errors.push(`#${idx}: if.minEligible должен быть числом ≥ 0`);
      if (cond.categoryIn && !Array.isArray(cond.categoryIn)) errors.push(`#${idx}: if.categoryIn должен быть массивом строк`);
      if (then.earnBps != null && (typeof then.earnBps !== 'number' || then.earnBps < 0 || then.earnBps > 10000)) errors.push(`#${idx}: then.earnBps должен быть 0..10000`);
      if (then.redeemLimitBps != null && (typeof then.redeemLimitBps !== 'number' || then.redeemLimitBps < 0 || then.redeemLimitBps > 10000)) errors.push(`#${idx}: then.redeemLimitBps должен быть 0..10000`);
    });
    return errors;
  }

  function computeRules(json: any, args: { channel: 'SMART'|'PC_POS'|'VIRTUAL'; weekday: number; eligibleTotal: number; category?: string }): { earnBps: number; redeemLimitBps: number } {
    let earnBps = s?.earnBps ?? 500;
    let redeemLimitBps = s?.redeemLimitBps ?? 5000;
    if (Array.isArray(json)) {
      for (const item of json) {
        try {
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
          const cond = (item as any).if ?? {};
          if (Array.isArray(cond.channelIn) && !cond.channelIn.includes(args.channel)) continue;
          if (Array.isArray(cond.weekdayIn) && !cond.weekdayIn.includes(args.weekday)) continue;
          if (cond.minEligible != null && args.eligibleTotal < Number(cond.minEligible)) continue;
          if (Array.isArray(cond.categoryIn) && !cond.categoryIn.includes(args.category)) continue;
          const then = (item as any).then ?? {};
          if (then.earnBps != null) earnBps = Number(then.earnBps);
          if (then.redeemLimitBps != null) redeemLimitBps = Number(then.redeemLimitBps);
        } catch {}
      }
    }
    return { earnBps, redeemLimitBps };
  }

  useEffect(() => {
    try {
      const json = rules.trim() ? JSON.parse(rules) : [];
      setRulesErrors(validateRules(json));
      setPreviewOut(computeRules(json, preview));
      // запрос к серверу для превью текущих сохраненных правил мерчанта
      previewRules(merchantId, preview)
        .then(res => setServerPreviewOut(res))
        .catch(()=>setServerPreviewOut(null));
    } catch { setRulesErrors(['Некорректный JSON']); setPreviewOut(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, preview.channel, preview.weekday, preview.eligibleTotal, preview.category, merchantId]);

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
          {rulesErrors.length > 0 ? (
            <div style={{ color: '#f38ba8' }}>Ошибки правил: <ul>{rulesErrors.map((er,i)=>(<li key={i}>{er}</li>))}</ul></div>
          ) : (
            <div style={{ color: '#a6e3a1' }}>Правила валидны</div>
          )}
          <div style={{ background: '#0e1629', padding: 10, borderRadius: 8 }}>
            <div style={{ marginBottom: 8 }}>Предпросмотр применения правил:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label>Канал:
                <select value={preview.channel} onChange={e=>setPreview(prev=>({ ...prev, channel: e.target.value as any }))} style={{ marginLeft: 8 }}>
                  <option value="SMART">SMART</option>
                  <option value="PC_POS">PC_POS</option>
                  <option value="VIRTUAL">VIRTUAL</option>
                </select>
              </label>
              <label>День недели:
                <input type="number" min={0} max={6} value={preview.weekday} onChange={e=>setPreview(prev=>({ ...prev, weekday: parseInt(e.target.value||'0',10) }))} style={{ marginLeft: 8, width: 80 }} />
              </label>
              <label>Сумма (eligible):
                <input type="number" min={0} value={preview.eligibleTotal} onChange={e=>setPreview(prev=>({ ...prev, eligibleTotal: parseInt(e.target.value||'0',10) }))} style={{ marginLeft: 8, width: 120 }} />
              </label>
              <label>Категория:
                <input value={preview.category || ''} onChange={e=>setPreview(prev=>({ ...prev, category: e.target.value||undefined }))} style={{ marginLeft: 8 }} placeholder="опц." />
              </label>
            </div>
            <div style={{ marginTop: 8, display:'grid', gap:6 }}>
              <div>Клиент: {previewOut ? (<span>earnBps=<b>{previewOut.earnBps}</b>, redeemLimitBps=<b>{previewOut.redeemLimitBps}</b></span>) : '—'}</div>
              <div>Сервер: {serverPreviewOut ? (
                <span>earnBps=<b>{serverPreviewOut.earnBps}</b>, redeemLimitBps=<b>{serverPreviewOut.redeemLimitBps}</b></span>
              ) : '—'}
              </div>
              {previewOut && serverPreviewOut && (previewOut.earnBps !== serverPreviewOut.earnBps || previewOut.redeemLimitBps !== serverPreviewOut.redeemLimitBps) && (
                <div style={{ color:'#f38ba8' }}>ВНИМАНИЕ: результат на сервере отличается от локального превью. Проверьте сохранённые правила.</div>
              )}
            </div>
          </div>
          <hr />
          <h3>Вебхуки</h3>
          <div>
            <label>Webhook URL:</label>
            <input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="https://example.com/webhook" />
          </div>
          <div>
            <label>Webhook Key ID:</label>
            <input value={webhookKeyId} onChange={e=>setWebhookKeyId(e.target.value)} style={{ marginLeft: 8, width: 280 }} placeholder="key_v1" />
          </div>
          <div>
            <label>Webhook Secret (HS256):</label>
            <input type="password" value={webhookSecret} onChange={e=>setWebhookSecret(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="вводите только при смене" />
          </div>
          <div>
            <label>Next Key ID:</label>
            <input value={webhookKeyIdNext} onChange={e=>setWebhookKeyIdNext(e.target.value)} style={{ marginLeft: 8, width: 280 }} placeholder="key_v2" />
          </div>
          <div>
            <label>Next Secret:</label>
            <input type="password" value={webhookSecretNext} onChange={e=>setWebhookSecretNext(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="для ротации ключей" />
          </div>
          <div>
            <label>
              Использовать Next Secret
              <input type="checkbox" checked={useWebhookNext} onChange={e=>setUseWebhookNext(e.target.checked)} style={{ marginLeft: 8 }} />
            </label>
          </div>
          <hr />
          <h3>Bridge подпись</h3>
          <div>
            <label>Bridge Secret:</label>
            <input type="password" value={bridgeSecret} onChange={e=>setBridgeSecret(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="вводите только при смене" />
          </div>
          <div>
            <label>Bridge Secret Next:</label>
            <input type="password" value={bridgeSecretNext} onChange={e=>setBridgeSecretNext(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="для ротации" />
          </div>
          <hr />
          <h3>Мини‑аппа (бренд)</h3>
          <div>
            <label>Основной цвет (HEX):</label>
            <input value={miniappThemePrimary} onChange={e=>setMiniappThemePrimary(e.target.value)} style={{ marginLeft: 8, width: 160 }} placeholder="#4f46e5" />
          </div>
          <div>
            <label>Цвет фона (HEX):</label>
            <input value={miniappThemeBg} onChange={e=>setMiniappThemeBg(e.target.value)} style={{ marginLeft: 8, width: 160 }} placeholder="#0b1220" />
          </div>
          <div>
            <label>Логотип (URL):</label>
            <input value={miniappLogoUrl} onChange={e=>setMiniappLogoUrl(e.target.value)} style={{ marginLeft: 8, width: 520 }} placeholder="https://.../logo.png" />
          </div>
          <div><button onClick={save} disabled={loading} style={{ padding: '8px 12px' }}>Сохранить</button></div>
        </div>
      )}

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
