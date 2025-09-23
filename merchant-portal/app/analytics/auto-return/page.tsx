"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Skeleton, Button } from '@loyalty/ui';

type Cohort = { cohort:string; from:string; to:string; size:number; retention:number[] };

export default function AutoReturnPage() {
  const [by, setBy] = React.useState<'month'|'week'>('month');
  const [limit, setLimit] = React.useState(6);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [rows, setRows] = React.useState<Cohort[]>([]);

  async function load(){
    setLoading(true); setMsg('');
    try {
      const url = new URL('/api/portal/analytics/cohorts', window.location.origin);
      url.searchParams.set('by', by);
      url.searchParams.set('limit', String(limit));
      const r = await fetch(url.toString());
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e:any) { setMsg(String(e?.message||e)); }
    finally { setLoading(false); }
  }
  React.useEffect(()=>{ load(); },[by, limit]);

  const shifts = Math.max(0, Math.max(...rows.map(r => r.retention.length)));

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ opacity:.8, fontSize:12 }}>Когорты по:</div>
        <Button variant={by==='month'?'primary':'secondary'} size="sm" onClick={()=>setBy('month')}>Месяцам</Button>
        <Button variant={by==='week'?'primary':'secondary'} size="sm" onClick={()=>setBy('week')}>Неделям</Button>
        <div style={{ marginLeft:12, opacity:.8, fontSize:12 }}>Глубина:</div>
        <select value={limit} onChange={e=>setLimit(Number(e.target.value)||6)} style={{ padding:6 }}>
          {[6,8,10,12,16,24].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader title="Когорты удержания (возврата)" />
        <CardBody>
          {loading ? <Skeleton height={240} /> : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign:'left', padding:'6px 8px', fontSize:12, opacity:.8 }}>Когорта</th>
                    <th style={{ textAlign:'left', padding:'6px 8px', fontSize:12, opacity:.8 }}>Размер</th>
                    {Array.from({length: shifts}).map((_,i)=>(
                      <th key={i} style={{ textAlign:'left', padding:'6px 8px', fontSize:12, opacity:.8 }}>+{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.cohort}>
                      <td style={{ padding:'6px 8px' }}><b>{r.cohort}</b> <span style={{ opacity:.6, fontSize:12 }}>({new Date(r.from).toLocaleDateString()}–{new Date(r.to).toLocaleDateString()})</span></td>
                      <td style={{ padding:'6px 8px' }}>{r.size}</td>
                      {Array.from({length: shifts}).map((_,i)=>{
                        const v = r.retention[i] ?? 0;
                        const bg = v>=30? 'rgba(34,197,94,.25)' : v>=15? 'rgba(234,179,8,.25)' : v>0? 'rgba(239,68,68,.25)' : 'transparent';
                        return <td key={i} style={{ padding:'6px 8px', background:bg }}>{v ? v.toFixed(1)+'%' : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {msg && <div style={{ color:'#f87171', marginTop:8 }}>{msg}</div>}
              {!rows.length && <div style={{ opacity:.7 }}>Нет данных</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
