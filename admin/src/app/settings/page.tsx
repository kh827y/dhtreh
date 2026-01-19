"use client";
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSettings, updateSettings, previewRules, type MerchantSettings } from '../../lib/admin';
import { usePreferredMerchantId } from '../../lib/usePreferredMerchantId';

type PreviewChannel = 'SMART' | 'PC_POS' | 'VIRTUAL';

function num(v: unknown, def: number | null = null): number | null {
  const n = parseInt(String(v || ''), 10);
  if (isNaN(n)) return def;
  return n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateRules(json: unknown): string[] {
  const errors: string[] = [];
  if (json == null || json === '') return errors;
  if (!Array.isArray(json)) {
    errors.push('Правила должны быть массивом объектов');
    return errors;
  }
  json.forEach((item, idx: number) => {
    if (!isRecord(item)) {
      errors.push(`#${idx}: элемент должен быть объектом`);
      return;
    }
    const cond = isRecord(item.if) ? item.if : {};
    const then = isRecord(item.then) ? item.then : {};
    if (cond.channelIn != null && !Array.isArray(cond.channelIn)) {
      errors.push(`#${idx}: if.channelIn должен быть массивом строк`);
    }
    if (cond.minEligible != null && (typeof cond.minEligible !== 'number' || cond.minEligible < 0)) {
      errors.push(`#${idx}: if.minEligible должен быть числом ≥ 0`);
    }
    if (then.earnBps != null && (typeof then.earnBps !== 'number' || then.earnBps < 0 || then.earnBps > 10000)) {
      errors.push(`#${idx}: then.earnBps должен быть 0..10000`);
    }
    if (then.redeemLimitBps != null && (typeof then.redeemLimitBps !== 'number' || then.redeemLimitBps < 0 || then.redeemLimitBps > 10000)) {
      errors.push(`#${idx}: then.redeemLimitBps должен быть 0..10000`);
    }
  });
  return errors;
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const initialMerchantId = searchParams.get('merchantId') || '';
  const { merchantId, setMerchantId } = usePreferredMerchantId(initialMerchantId);
  const [s, setS] = useState<MerchantSettings | null>(null);
  const [rules, setRules] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [rulesErrors, setRulesErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ channel: PreviewChannel }>({
    channel: 'SMART',
  });
  const [previewOut, setPreviewOut] = useState<{ earnBps: number; redeemLimitBps: number } | null>(null);
  const [serverPreviewOut, setServerPreviewOut] = useState<{ earnBps: number; redeemLimitBps: number } | null>(null);
  // локальные поля для секретов (не подставляем значения из API)
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [webhookKeyId, setWebhookKeyId] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [webhookKeyIdNext, setWebhookKeyIdNext] = useState<string>('');
  const [webhookSecretNext, setWebhookSecretNext] = useState<string>('');
  const [useWebhookNext, setUseWebhookNext] = useState<boolean>(false);
  const [miniappBaseUrl, setMiniappBaseUrl] = useState<string>('');
  const [miniappThemePrimary, setMiniappThemePrimary] = useState<string>('');
  const [miniappThemeBg, setMiniappThemeBg] = useState<string>('');
  const [telegramStartParamRequired, setTelegramStartParamRequired] = useState<boolean>(false);

  useEffect(() => {
    if (!merchantId) { setS(null); setMsg('Укажите merchantId'); return; }
    setLoading(true);
    getSettings(merchantId).then(r => {
      setS(r);
      setRules(r.rulesJson ? JSON.stringify(r.rulesJson, null, 2) : '');
      setWebhookUrl(r.webhookUrl || '');
      setWebhookKeyId(r.webhookKeyId || '');
      setWebhookKeyIdNext(r.webhookKeyIdNext || '');
      setUseWebhookNext(!!r.useWebhookNext);
      setMiniappBaseUrl(typeof r.miniappBaseUrl === 'string' ? r.miniappBaseUrl : '');
      setMiniappThemePrimary(r.miniappThemePrimary || '');
      setMiniappThemeBg(r.miniappThemeBg || '');
      setTelegramStartParamRequired(!!r.telegramStartParamRequired);
    }).catch((e: unknown) => setMsg(String(e instanceof Error ? e.message : e))).finally(()=>setLoading(false));
  }, [merchantId]);

  const save = async () => {
    if (!s) return;
    setLoading(true);
    try {
      let rulesJson: unknown = undefined;
      if (rules.trim()) {
        try { rulesJson = JSON.parse(rules); }
        catch (e: unknown) { setMsg('Некорректный JSON правил: ' + (e instanceof Error ? e.message : e)); setLoading(false); return; }
        const errs = validateRules(rulesJson);
        setRulesErrors(errs);
        if (errs.length) { setMsg('Исправьте ошибки правил перед сохранением'); setLoading(false); return; }
      }
      const dto: Partial<MerchantSettings> = {
        qrTtlSec: s.qrTtlSec,
        redeemCooldownSec: s.redeemCooldownSec,
        earnCooldownSec: s.earnCooldownSec,
        redeemDailyCap: s.redeemDailyCap ?? null,
        earnDailyCap: s.earnDailyCap ?? null,
        pointsTtlDays: s.pointsTtlDays ?? null,
        maxOutlets: s.maxOutlets ?? null,
        timezone: s.timezone ?? undefined,
        rulesJson,
        webhookUrl: webhookUrl || undefined,
        webhookKeyId: webhookKeyId || undefined,
        webhookSecret: webhookSecret || undefined,
        webhookKeyIdNext: webhookKeyIdNext || undefined,
        webhookSecretNext: webhookSecretNext || undefined,
        useWebhookNext: useWebhookNext,
        miniappBaseUrl: miniappBaseUrl || undefined,
        miniappThemePrimary: miniappThemePrimary || undefined,
        miniappThemeBg: miniappThemeBg || undefined,
        telegramStartParamRequired: telegramStartParamRequired,
      };
      const r = await updateSettings(merchantId, dto);
      setS(r);
      setMsg('Сохранено');
      setWebhookSecret('');
      setWebhookSecretNext('');
    } catch (e: unknown) { setMsg('Ошибка сохранения: ' + (e instanceof Error ? e.message : e)); }
    finally { setLoading(false); }
  };

  const computeRules = useCallback(
    (json: unknown, args: { channel: PreviewChannel }): { earnBps: number; redeemLimitBps: number } => {
      let earnBps = s?.earnBps ?? 300;
      let redeemLimitBps = s?.redeemLimitBps ?? 5000;
      if (Array.isArray(json)) {
        for (const item of json) {
          try {
            if (!isRecord(item)) continue;
            const cond = isRecord(item.if) ? item.if : {};
            if (Array.isArray(cond.channelIn) && !cond.channelIn.includes(args.channel)) continue;
            const then = isRecord(item.then) ? item.then : {};
            if (then.earnBps != null) {
              const nextEarn = Number(then.earnBps);
              if (Number.isFinite(nextEarn)) earnBps = nextEarn;
            }
            if (then.redeemLimitBps != null) {
              const nextRedeem = Number(then.redeemLimitBps);
              if (Number.isFinite(nextRedeem)) redeemLimitBps = nextRedeem;
            }
          } catch {}
        }
      }
      return { earnBps, redeemLimitBps };
    },
    [s?.earnBps, s?.redeemLimitBps],
  );

  useEffect(() => {
    try {
      const json = rules.trim() ? JSON.parse(rules) : [];
      setRulesErrors(validateRules(json));
      setPreviewOut(computeRules(json, preview));
      // запрос к серверу для превью текущих сохраненных правил мерчанта
      previewRules(merchantId, {
        channel: preview.channel,
        weekday: new Date().getDay(),
      })
        .then(res => setServerPreviewOut(res))
        .catch(()=>setServerPreviewOut(null));
    } catch { setRulesErrors(['Некорректный JSON']); setPreviewOut(null); }
  }, [rules, preview, merchantId, computeRules]);

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
            <label>QR TTL (сек):</label>
            <input type="number" min={15} max={600} value={s.qrTtlSec} onChange={e=>setS({ ...s, qrTtlSec: num(e.target.value, s.qrTtlSec) || 300 })} style={{ marginLeft: 8, width: 100 }} />
          </div>
          <div>
            <label>Cooldown списаний (сек):</label>
            <input
              type="number"
              min={0}
              max={86400}
              value={s.redeemCooldownSec}
              onChange={e=>setS({ ...s, redeemCooldownSec: num(e.target.value, s.redeemCooldownSec) || 0 })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <div>
            <label>Cooldown начислений (сек):</label>
            <input
              type="number"
              min={0}
              max={86400}
              value={s.earnCooldownSec}
              onChange={e=>setS({ ...s, earnCooldownSec: num(e.target.value, s.earnCooldownSec) || 0 })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <hr />
          <h3>Лимиты и параметры</h3>
          <div>
            <label>Лимит списаний в день (баллы):</label>
            <input
              type="number"
              min={0}
              value={s.redeemDailyCap ?? ''}
              onChange={e=>setS({ ...s, redeemDailyCap: num(e.target.value, null) })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <div>
            <label>Лимит начислений в день (баллы):</label>
            <input
              type="number"
              min={0}
              value={s.earnDailyCap ?? ''}
              onChange={e=>setS({ ...s, earnDailyCap: num(e.target.value, null) })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <div>
            <label>TTL баллов (дни):</label>
            <input
              type="number"
              min={0}
              value={s.pointsTtlDays ?? ''}
              onChange={e=>setS({ ...s, pointsTtlDays: num(e.target.value, null) })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <div>
            <label>Максимум торговых точек:</label>
            <input
              type="number"
              min={0}
              value={s.maxOutlets ?? ''}
              onChange={e=>setS({ ...s, maxOutlets: num(e.target.value, null) })}
              style={{ marginLeft: 8, width: 120 }}
            />
          </div>
          <div>
            <label>Часовой пояс (код):</label>
            <input
              value={s.timezone ?? ''}
              onChange={e=>setS({ ...s, timezone: e.target.value })}
              style={{ marginLeft: 8, width: 160 }}
              placeholder="MSK+3"
            />
          </div>
          <div>
            <label>
              Требовать start‑параметр Telegram
              <input type="checkbox" checked={telegramStartParamRequired} onChange={e=>setTelegramStartParamRequired(e.target.checked)} style={{ marginLeft: 8 }} />
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
                <select value={preview.channel} onChange={e=>setPreview(prev=>({ ...prev, channel: e.target.value as PreviewChannel }))} style={{ marginLeft: 8 }}>
                  <option value="SMART">SMART</option>
                  <option value="PC_POS">PC_POS</option>
                  <option value="VIRTUAL">VIRTUAL</option>
                </select>
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
          <h3>Мини‑аппа (бренд)</h3>
          <div style={{ display:'grid', gap:8 }}>
            <div>
              <label>Базовый URL мини‑аппы:</label>
              <input
                value={miniappBaseUrl}
                onChange={e=>setMiniappBaseUrl(e.target.value)}
                style={{ marginLeft: 8, width: 520 }}
                placeholder="https://example.com/miniapp"
              />
              <div style={{ fontSize:12, opacity:.8, marginTop:4 }}>
                Используется для deep‑link из Telegram / сайта (например, ссылка на WebApp или страницу мини‑аппы).
              </div>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:16, alignItems:'center' }}>
              <div style={{ display:'grid', gap:6 }}>
                <label>Основной цвет (HEX):</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input
                    type="color"
                    value={miniappThemePrimary || '#4f46e5'}
                    onChange={e=>setMiniappThemePrimary(e.target.value)}
                    style={{ width:40, height:28, padding:0, border:'none', background:'transparent' }}
                  />
                  <input
                    value={miniappThemePrimary}
                    onChange={e=>setMiniappThemePrimary(e.target.value)}
                    style={{ width:120 }}
                    placeholder="#4f46e5"
                  />
                </div>
                <div style={{ fontSize:12, opacity:.8 }}>Рекомендуется яркий акцентный цвет бренда (по умолчанию #4f46e5).</div>
              </div>
              <div style={{ display:'grid', gap:6 }}>
                <label>Цвет фона (HEX):</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input
                    type="color"
                    value={miniappThemeBg || '#f9fafb'}
                    onChange={e=>setMiniappThemeBg(e.target.value)}
                    style={{ width:40, height:28, padding:0, border:'none', background:'transparent' }}
                  />
                  <input
                    value={miniappThemeBg}
                    onChange={e=>setMiniappThemeBg(e.target.value)}
                    style={{ width:120 }}
                    placeholder="#f9fafb"
                  />
                </div>
                <div style={{ fontSize:12, opacity:.8 }}>Фон мини‑аппы (по умолчанию #f9fafb).</div>
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:12, opacity:.8, marginBottom:4 }}>Предпросмотр карточки мини‑аппы:</div>
              <div
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:12,
                  padding:12,
                  borderRadius:12,
                  background: miniappThemeBg || '#f9fafb',
                  border:'1px solid rgba(148,163,184,.4)',
                  maxWidth:420,
                }}
              >
                <div
                  style={{
                    width:40,
                    height:40,
                    borderRadius:10,
                    background:'#020617',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center',
                    overflow:'hidden',
                  }}
                >
                  {s?.miniappLogoUrl && /^https?:\/\//i.test(s.miniappLogoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.miniappLogoUrl} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <span style={{ fontSize:18, color:'#e2e8f0' }}>∞</span>
                  )}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Miniapp брендинг</div>
                  <div style={{ fontSize:12, opacity:.8, color:'#cbd5f5' }}>Кнопки и акценты используют основной цвет, фон — цвет площадки.</div>
                  <div style={{ marginTop:8, display:'flex', gap:8 }}>
                    <div
                      style={{
                        padding:'4px 10px',
                        borderRadius:999,
                        fontSize:12,
                        fontWeight:600,
                        background: miniappThemePrimary || '#4f46e5',
                        color:'#f9fafb',
                      }}
                    >
                      CTA
                    </div>
                    <div
                      style={{
                        padding:'4px 10px',
                        borderRadius:999,
                        fontSize:12,
                        border:'1px solid rgba(148,163,184,.6)',
                        color:'#e5e7eb',
                      }}
                    >
                      Secondary
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div><button onClick={save} disabled={loading} style={{ padding: '8px 12px' }}>Сохранить</button></div>
        </div>
      )}

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div>Загрузка…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
