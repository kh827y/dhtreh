"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function PromotionsPage() {
  const [loading] = React.useState(true);
  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Промоакции</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Buy-N-Get-1, спеццены, бонусы</div>
        </div>
        <Button variant="primary">Добавить промо</Button>
      </div>
      <Card>
        <CardHeader title="Список промоакций" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : <div>Таблица промо (TODO)</div>}
        </CardBody>
      </Card>
    </div>
  );
}
