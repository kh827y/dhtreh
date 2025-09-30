"use client";
import { useEffect, useMemo, useState } from 'react';
import { broadcast, testNotification, type BroadcastArgs } from '../../lib/notifications';
import { getSegmentsAdmin, type SegmentInfo } from '../../lib/admin';

export default function NotificationsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [channel, setChannel] = useState<BroadcastArgs['channel']>('ALL');
  const [segmentId, setSegmentId] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [html, setHtml] = useState<string>('');
  const [variables, setVariables] = useState<string>('{}');
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>('');
  const [estimated, setEstimated] = useState<number | null>(null);
  const [segments, setSegments] = useState<SegmentInfo[] | null>(null);
  const [segBusy, setSegBusy] = useState<boolean>(false);
  const [validation, setValidation] = useState<string>('');
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewVarsErr, setPreviewVarsErr] = useState<string>('');

  // i18n (lightweight)
  const [locale, setLocale] = useState<'ru'|'en'>(() => (typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'ru'));
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const lang = navigator.language || 'ru';
      setLocale(lang.startsWith('en') ? 'en' : 'ru');
    }
  }, []);
  const dict = useMemo(() => ({
    ru: {
      title: 'Рассылки',
      broadcast: 'Широковещательная рассылка',
      merchant: 'Мерчант',
      channel: 'Канал',
      segment: 'Сегмент',
      noSegment: '(без сегмента)',
      loadingSegments: 'Загрузка сегментов…',
      dryRun: 'Dry‑run',
      subject: 'Subject (EMAIL)',
      text: 'Text',
      html: 'HTML',
      variables: 'Variables (JSON)',
      check: 'Проверить (dry‑run)',
      send: 'Отправить',
      preview: 'Предпросмотр',
      hidePreview: 'Скрыть предпросмотр',
      recipientsEstimate: 'Оценка получателей',
      previewSubject: 'Предпросмотр (SUBJECT)',
      previewText: 'Предпросмотр (TEXT)',
      previewHtml: 'Предпросмотр (HTML)',
      testTitle: 'Тестовое уведомление',
      recipient: 'Получатель (email/телефон/токен)',
      sendTest: 'Отправить тест',
      msgQueued: 'Запрос на рассылку поставлен в очередь',
      dryOk: 'Dry-run OK',
      varsHint: 'Можно использовать переменные в шаблоне: {{customerName}}, {{merchantName}} и др. Поля заменяются из JSON ниже.'
    },
    en: {
      title: 'Notifications',
      broadcast: 'Broadcast',
      merchant: 'Merchant',
      channel: 'Channel',
      segment: 'Segment',
      noSegment: '(no segment)',
      loadingSegments: 'Loading segments…',
      dryRun: 'Dry‑run',
      subject: 'Subject (EMAIL)',
      text: 'Text',
      html: 'HTML',
      variables: 'Variables (JSON)',
      check: 'Check (dry‑run)',
      send: 'Send',
      preview: 'Preview',
      hidePreview: 'Hide preview',
      recipientsEstimate: 'Estimated recipients',
      previewSubject: 'Preview (SUBJECT)',
      previewText: 'Preview (TEXT)',
      previewHtml: 'Preview (HTML)',
      testTitle: 'Test Notification',
      recipient: 'Recipient (email/phone/token)',
      sendTest: 'Send test',
      msgQueued: 'Broadcast enqueued',
      dryOk: 'Dry-run OK',
      varsHint: 'You can use variables in templates: {{customerName}}, {{merchantName}} etc. Fields are substituted from JSON below.'
    }
  } as const)[locale], [locale]);
  const t = (k: keyof typeof dict) => dict[k] || String(k);

  function applyVars(tpl: string, vars: Record<string, any>): string {
    if (!tpl) return '';
    return tpl.replace(/{{\s*([a-zA-Z0-9_\.]+)\s*}}/g, (_m, key) => {
      const path = String(key).split('.');
      let cur: any = vars;
      for (const k of path) { if (cur && typeof cur === 'object' && k in cur) cur = cur[k]; else { cur = ''; break; } }
      return String(cur ?? '');
    });
  }

  const parsedVars: Record<string, any> = useMemo(() => {
    try {
      setPreviewVarsErr('');
      return variables ? JSON.parse(variables) : {};
    } catch (e:any) {
      setPreviewVarsErr('Некорректный JSON для Variables');
      return {};
    }
  }, [variables]);
  const previewSubject = useMemo(() => applyVars(subject, parsedVars), [subject, parsedVars]);
  const previewText = useMemo(() => applyVars(text, parsedVars), [text, parsedVars]);
  const previewHtml = useMemo(() => applyVars(html, parsedVars), [html, parsedVars]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSegBusy(true);
      setSegments(null);
      try {
        const list = await getSegmentsAdmin(merchantId);
        if (!cancelled) setSegments(list || []);
      } catch (e) {
        if (!cancelled) setSegments([]);
      } finally {
        if (!cancelled) setSegBusy(false);
      }
    }
    if (merchantId) load();
    return () => { cancelled = true; };
  }, [merchantId]);

  // Test send
  const [testTo, setTestTo] = useState<string>('');
  const [testChannel, setTestChannel] = useState<'EMAIL'|'PUSH'>('EMAIL');
  const [testSubject, setTestSubject] = useState<string>('');
  const [testText, setTestText] = useState<string>('');
  const [testHtml, setTestHtml] = useState<string>('');

  const validate = (): string | null => {
    if (!merchantId) return 'Укажите merchantId';
    const ch = String(channel).toUpperCase();
    if (ch === 'EMAIL') {
      if (!subject.trim()) return 'Для EMAIL требуется Subject';
      if (!text.trim() && !html.trim()) return 'Для EMAIL требуется Text или HTML';
    }
    if (ch === 'PUSH') {
      if (!subject.trim() && !text.trim()) return 'Для PUSH требуется Subject или Text';
    }
    return null;
  };

  const onBroadcast = async () => {
    setBusy(true); setMsg('');
    try {
      const v = validate();
      if (v) { setValidation(v); setBusy(false); return; } else setValidation('');
      let vars: any = {};
      try { vars = variables ? JSON.parse(variables) : {}; } catch (e:any) { setMsg('Некорректный JSON в variables'); setBusy(false); return; }
      const res = await broadcast({
        merchantId,
        channel,
        segmentId: segmentId || undefined,
        template: { subject: subject || undefined, text: text || undefined, html: html || undefined },
        variables: vars,
        dryRun,
      });
      if (dryRun) {
        setEstimated((res as any).estimated ?? null);
        const est = (res as any).estimated;
        setMsg(`${t('dryOk')}${est!=null?` (${t('recipientsEstimate')}: ${est})`:''}`);
      } else {
        setEstimated(null);
        setMsg(t('msgQueued'));
      }
    } catch (e:any) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const onTest = async () => {
    setBusy(true); setMsg('');
    try {
      await testNotification({ merchantId, channel: testChannel, to: testTo, template: { subject: testSubject || undefined, text: testText || undefined, html: testHtml || undefined } });
      setMsg('Тестовое уведомление поставлено в очередь');
    } catch (e:any) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2>{t('title')}</h2>
        <div>
          <label style={{ fontSize:12, opacity:0.8 }}>Lang:{' '}
            <select aria-label="Language" value={locale} onChange={e=>setLocale(e.target.value as any)}>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
      </div>
      <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
        <h3 style={{ marginTop:0 }}>{t('broadcast')}</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
          <label>{t('merchant')}: <input aria-label="Merchant ID" value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
          <label>{t('channel')}:
            <select aria-label="Channel" value={channel} onChange={e=>setChannel(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="ALL">ALL</option>
              <option value="EMAIL">EMAIL</option>
              <option value="PUSH">PUSH</option>
            </select>
          </label>
          <label>{t('segment')}:
            {segBusy ? (
              <div style={{ display:'inline-flex', gap:8, marginLeft:8 }} aria-label="Segments loading">
                <div style={{ width:160, height:28, background:'#111827', borderRadius:6, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, #111827, #1f2937, #111827)', transform:'translateX(-100%)', animation:'shimmer 1.2s infinite' }} />
                </div>
                <style>{`@keyframes shimmer { 100% { transform: translateX(100%); } }`}</style>
              </div>
            ) : (
              <select aria-label="Segment" value={segmentId} onChange={e=>setSegmentId(e.target.value)} style={{ marginLeft: 8 }}>
                <option value="">{t('noSegment')}</option>
                {(segments||[]).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{(s as any)._count?.customers ? ` — ${(s as any)._count.customers}` : (s.size!=null?` — ${s.size}`:'')}</option>
                ))}
              </select>
            )}
          </label>
          {segBusy && <span style={{ opacity:0.8 }}>{t('loadingSegments')}</span>}
          <label>{t('dryRun')}: <input aria-label="Dry-run" type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.target.checked)} /></label>
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          <input aria-label={t('subject')} placeholder={t('subject')} value={subject} onChange={e=>setSubject(e.target.value)} />
          <textarea aria-label={t('text')} placeholder={t('text')} value={text} onChange={e=>setText(e.target.value)} rows={3} />
          <textarea aria-label={t('html')} placeholder={t('html')} value={html} onChange={e=>setHtml(e.target.value)} rows={3} />
          <textarea aria-label={t('variables')} placeholder={t('variables')} value={variables} onChange={e=>setVariables(e.target.value)} rows={3} />
          <div style={{ fontSize:12, opacity:0.85 }}>{dict.varsHint}</div>
          {validation && <div style={{ color:'#f38ba8' }}>{validation}</div>}
          {previewVarsErr && <div style={{ color:'#f38ba8' }}>{previewVarsErr}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button aria-label={dryRun ? t('check') : t('send')} onClick={onBroadcast} disabled={busy} style={{ padding:'6px 10px' }}>{dryRun?t('check'):t('send')}</button>
            <button aria-label={showPreview ? t('hidePreview') : t('preview')} onClick={()=>setShowPreview(v=>!v)} type="button" disabled={busy} style={{ padding:'6px 10px' }}>{showPreview?t('hidePreview'):t('preview')}</button>
          </div>
          {estimated!=null && dryRun && <div style={{ opacity:0.9 }}>{t('recipientsEstimate')}: <b>{estimated}</b></div>}
          {showPreview && (
            <div style={{ display:'grid', gap:8, marginTop:8 }}>
              <div>
                <div style={{ opacity:0.8, marginBottom:4 }}>{t('previewSubject')}</div>
                <pre style={{ background:'#111827', padding:10, borderRadius:8, whiteSpace:'pre-wrap' }}>{previewSubject || '(пусто)'}</pre>
              </div>
              <div>
                <div style={{ opacity:0.8, marginBottom:4 }}>{t('previewText')}</div>
                <pre style={{ background:'#111827', padding:10, borderRadius:8, whiteSpace:'pre-wrap' }}>{previewText || '(пусто)'}</pre>
              </div>
              <div>
                <div style={{ opacity:0.8, marginBottom:4 }}>{t('previewHtml')}</div>
                <iframe sandbox="allow-same-origin" style={{ width:'100%', height:240, border:'1px solid #334155', borderRadius:8 }} srcDoc={previewHtml || `<div style='font-family:system-ui;padding:16px;color:#94a3b8'>Нет HTML</div>`} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
        <h3 style={{ marginTop:0 }}>{t('testTitle')}</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
          <label>{t('channel')}:
            <select aria-label="Test Channel" value={testChannel} onChange={e=>setTestChannel(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="EMAIL">EMAIL</option>
              <option value="PUSH">PUSH</option>
            </select>
          </label>
          <input aria-label={t('recipient')} placeholder={t('recipient')} value={testTo} onChange={e=>setTestTo(e.target.value)} />
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          <input aria-label={t('subject')} placeholder={t('subject')} value={testSubject} onChange={e=>setTestSubject(e.target.value)} />
          <textarea aria-label={t('text')} placeholder={t('text')} value={testText} onChange={e=>setTestText(e.target.value)} rows={3} />
          <textarea aria-label={t('html')} placeholder={t('html')} value={testHtml} onChange={e=>setTestHtml(e.target.value)} rows={3} />
          <button aria-label={t('sendTest')} onClick={onTest} disabled={busy} style={{ padding:'6px 10px' }}>{t('sendTest')}</button>
        </div>
      </div>

      {msg && <div aria-live="polite" style={{ marginTop:8 }}>{msg}</div>}
    </div>
  );
}
