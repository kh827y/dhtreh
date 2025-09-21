"use client";
import React from 'react';
import { Button, Card, CardBody, CardHeader, Skeleton } from '@loyalty/ui';

export default function LoyaltyPage() {
  const [loading, setLoading] = React.useState(true);
  React.useEffect(()=>{ const t = setTimeout(()=>setLoading(false), 500); return ()=>clearTimeout(t); },[]);

  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Настройки программы лояльности</div>
          <div style={{ opacity: .8, fontSize: 13 }}>Ставки начисления/списания, лимиты, TTL, отложенные начисления</div>
        </div>
        <Button variant="primary">Сохранить</Button>
      </div>

      <Card>
        <CardHeader title="Базовые параметры" subtitle="bps, лимиты, TTL" />
        <CardBody>
          {loading ? (
            <div style={{ display:'grid', gap: 8 }}>
              <Skeleton height={16} />
              <Skeleton height={16} />
              <Skeleton height={16} />
            </div>
          ) : (
            <div style={{ opacity:.7 }}>Форма настроек (TODO)</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
