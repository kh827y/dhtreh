"use client";
import React from 'react';
import { Button, Card, CardBody, CardHeader, Chart, MotionFadeIn, Skeleton } from '@loyalty/ui';

export default function Page() {
  const [loading, setLoading] = React.useState(true);
  const [kpi, setKpi] = React.useState<{ revenue: number; tx: number; avg: number }|null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setKpi({ revenue: 125000, tx: 320, avg: 390 });
      setLoading(false);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const option = {
    grid: { left: 30, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], axisLine: { lineStyle: { color: '#334155' } }, axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#334155' } }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } }, axisLabel: { color: '#94a3b8' } },
    series: [{ type: 'line', smooth: true, data: [120, 132, 101, 134, 90, 230, 210], areaStyle: { opacity: 0.15 }, lineStyle: { color: '#22d3ee' } }],
    tooltip: { trigger: 'axis' }
  } as const;

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <MotionFadeIn>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Мастер настройки</div>
            <div style={{ opacity: .8, fontSize: 13 }}>Быстрый старт: проверьте параметры программы, добавьте точки и сотрудников</div>
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <Button variant="primary" onClick={()=>location.href='/settings/system'}>Системные настройки</Button>
            <Button variant="secondary" onClick={()=>location.href='/settings/outlets'}>Торговые точки</Button>
          </div>
        </div>
      </MotionFadeIn>

      <div style={{ display:'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Card>
          <CardHeader title="Выручка за 7д" subtitle="RUB" />
          <CardBody>
            {loading ? <Skeleton height={22} /> : <div style={{ fontSize: 24, fontWeight: 800 }}>{kpi!.revenue.toLocaleString('ru-RU')} ₽</div>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Транзакции" subtitle="за 7 дней" />
          <CardBody>
            {loading ? <Skeleton height={22} /> : <div style={{ fontSize: 24, fontWeight: 800 }}>{kpi!.tx.toLocaleString('ru-RU')}</div>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Средний чек" subtitle="RUB" />
          <CardBody>
            {loading ? <Skeleton height={22} /> : <div style={{ fontSize: 24, fontWeight: 800 }}>{kpi!.avg.toLocaleString('ru-RU')} ₽</div>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Динамика продаж" subtitle="последние 7 дней" />
        <CardBody>
          {loading ? <Skeleton height={180} /> : <Chart option={option as any} height={260} />}
        </CardBody>
      </Card>
    </div>
  );
}
