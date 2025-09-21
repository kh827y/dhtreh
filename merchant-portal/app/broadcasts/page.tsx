"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function BroadcastsPage() {
  const [channel, setChannel] = React.useState<'EMAIL'|'SMS'|'PUSH'|'ALL'>('EMAIL');
  const [segmentId, setSegmentId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [text, setText] = React.useState('');
  const [dryRun, setDryRun] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [estimated, setEstimated] = React.useState<number|null>(null);

  async function submit() {
    setLoading(true); setMsg(''); setEstimated(null);
    try {
      const body = {
        channel,
        segmentId: segmentId || undefined,
        template: subject || text ? { subject: subject || undefined, text: text || undefined } : undefined,
        dryRun,
      };
      const res = await fetch('/api/portal/notifications/broadcast', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.message || 'Ошибка запроса');
      if (dryRun) {
        setEstimated(data?.estimated ?? 0);
        setMsg('Оценка выполнена');
      } else {
        setMsg('Рассылка поставлена в очередь');
      }
    } catch (e: any) { setMsg(String(e?.message || e)); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Рассылки</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Email/SMS/Push, сегменты, dry‑run</div>
        </div>
      </div>
      <Card>
        <CardHeader title="Создать рассылку" />
        <CardBody>
          <div style={{ display:'grid', gap: 10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap: 8 }}>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Канал</span>
                <select value={channel} onChange={e=>setChannel(e.target.value as any)} style={{ padding:8 }}>
                  <option value="EMAIL">EMAIL</option>
                  <option value="SMS">SMS</option>
                  <option value="PUSH">PUSH</option>
                  <option value="ALL">ALL</option>
                </select>
              </label>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Сегмент (опц.)</span>
                <input placeholder="segmentId" value={segmentId} onChange={e=>setSegmentId(e.target.value)} style={{ padding:8 }} />
              </label>
            </div>
            <div style={{ display:'grid', gap: 6 }}>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Тема (для Email, опц.)</span>
                <input placeholder="Тема" value={subject} onChange={e=>setSubject(e.target.value)} style={{ padding:8 }} />
              </label>
              <label style={{ display:'grid', gap: 4 }}>
                <span style={{ opacity:.8, fontSize:12 }}>Текст (опц.)</span>
                <textarea placeholder="Текст сообщения" value={text} onChange={e=>setText(e.target.value)} style={{ padding:8, minHeight: 100 }} />
              </label>
            </div>
            <label style={{ display:'flex', gap: 8, alignItems:'center' }}>
              <input type="checkbox" checked={dryRun} onChange={e=>setDryRun(e.target.checked)} /> Только оценка (dry‑run)
            </label>
            <div style={{ display:'flex', gap: 8 }}>
              <Button variant="primary" onClick={submit} disabled={loading}>{loading ? 'Отправка...' : (dryRun ? 'Оценить' : 'Отправить')}</Button>
              {estimated != null && <div style={{ padding:'6px 8px', borderRadius:6, background:'rgba(255,255,255,.06)' }}>Оценка аудитории: <b>{estimated}</b></div>}
            </div>
            {msg && <div style={{ color: msg.includes('Ошибка')? '#f87171':'#4ade80' }}>{msg}</div>}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="История" />
        <CardBody>
          <Skeleton height={140} />
        </CardBody>
      </Card>
    </div>
  );
}
