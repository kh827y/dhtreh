"use client";
import React from 'react';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

export default function ReferralProgramSettingsPage() {
  const [loading] = React.useState(true);
  return (
    <div style={{ display:'grid', gap: 16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Реферальная программа</div>
          <div style={{ opacity:.8, fontSize: 13 }}>Настройки и награды</div>
        </div>
        <Button variant="primary">Сохранить</Button>
      </div>
      <Card>
        <CardHeader title="Параметры" />
        <CardBody>
          {loading ? <Skeleton height={160} /> : <div>Форма настроек (TODO)</div>}
        </CardBody>
      </Card>
    </div>
  );
}
