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
  const [testChannel, setTestChannel] = useState<'EMAIL'|'PUSH'|'SMS'>('EMAIL');
  const [testSubject, setTestSubject] = useState<string>('');
  const [testText, setTestText] = useState<string>('');
  const [testHtml, setTestHtml] = useState<string>('');

  const onBroadcast = async () => {
    setBusy(true); setMsg('');
    try {
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
        setMsg(`Dry-run OK${(res as any).estimated!=null?` (оценка: ${(res as any).estimated})`:''}`);
      } else {
        setEstimated(null);
        setMsg('Запрос на рассылку поставлен в очередь');
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
      <h2>Рассылки</h2>
      <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
        <h3 style={{ marginTop:0 }}>Широковещательная рассылка</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
          <label>Мерчант: <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} /></label>
          <label>Канал:
            <select value={channel} onChange={e=>setChannel(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="ALL">ALL</option>
              <option value="EMAIL">EMAIL</option>
              <option value="PUSH">PUSH</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
          <label>Сегмент:
            <select value={segmentId} onChange={e=>setSegmentId(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">(без сегмента)</option>
              {(segments||[]).map(s => (
                <option key={s.id} value={s.id}>{s.name}{(s as any)._count?.customers ? ` — ${(s as any)._count.customers}` : (s.size!=null?` — ${s.size}`:'')}</option>
              ))}
            </select>
          </label>
          {segBusy && <span style={{ opacity:0.8 }}>Загрузка сегментов…</span>}
          <label>Dry‑run: <input type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.target.checked)} /></label>
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          <input placeholder="Subject (EMAIL)" value={subject} onChange={e=>setSubject(e.target.value)} />
          <textarea placeholder="Text" value={text} onChange={e=>setText(e.target.value)} rows={3} />
          <textarea placeholder="HTML" value={html} onChange={e=>setHtml(e.target.value)} rows={3} />
          <textarea placeholder="Variables (JSON)" value={variables} onChange={e=>setVariables(e.target.value)} rows={3} />
          <button onClick={onBroadcast} disabled={busy} style={{ padding:'6px 10px' }}>{dryRun?'Проверить (dry‑run)':'Отправить'}</button>
          {estimated!=null && dryRun && <div style={{ opacity:0.9 }}>Оценка получателей: <b>{estimated}</b></div>}
        </div>
      </div>

      <div style={{ background:'#0e1629', padding:10, borderRadius:8 }}>
        <h3 style={{ marginTop:0 }}>Тестовое уведомление</h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
          <label>Канал:
            <select value={testChannel} onChange={e=>setTestChannel(e.target.value as any)} style={{ marginLeft: 8 }}>
              <option value="EMAIL">EMAIL</option>
              <option value="PUSH">PUSH</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
          <input placeholder="Получатель (email/телефон/токен)" value={testTo} onChange={e=>setTestTo(e.target.value)} />
        </div>
        <div style={{ display:'grid', gap:8, marginTop:8 }}>
          <input placeholder="Subject (EMAIL)" value={testSubject} onChange={e=>setTestSubject(e.target.value)} />
          <textarea placeholder="Text" value={testText} onChange={e=>setTestText(e.target.value)} rows={3} />
          <textarea placeholder="HTML" value={testHtml} onChange={e=>setTestHtml(e.target.value)} rows={3} />
          <button onClick={onTest} disabled={busy} style={{ padding:'6px 10px' }}>Отправить тест</button>
        </div>
      </div>

      {msg && <div style={{ marginTop:8 }}>{msg}</div>}
    </div>
  );
}
