"use client";
import Link from 'next/link';
import { Card, CardHeader, CardBody } from '@loyalty/ui';

export default function SettingsPage() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Системные настройки</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Управление кассовыми требованиями и TTL перенесено в админ‑панель</div>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Кассовые ограничения теперь в админке"
          subtitle="Переключатели «Требовать подпись Bridge», «Требовать Staff‑ключ» и базовый QR TTL настраиваются через раздел «Мерчанты» админ‑панели"
        />
        <CardBody>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Чтобы изменить требования к подписи Bridge или Staff‑ключу, а также таймаут QR‑кодов, откройте админку владельца и перейдите по адресу{' '}
            <Link href="http://localhost:3001/merchants" style={{ color: '#60a5fa' }}>http://localhost:3001/merchants</Link>. Там рядом с мерчантом есть блок «Настройки кассовых операций».
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Лимиты начисления/списания управляются уровнями"
          subtitle="Поля Earn Bps и Redeem Limit Bps удалены из этого раздела"
        />
        <CardBody>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Базовые ставки начисления и списания теперь рассчитываются по уровням программы лояльности. Настройте уровни и бонусы на странице{' '}
            <Link href="/loyalty/mechanics/levels" style={{ color: '#60a5fa' }}>«Уровни»</Link>, чтобы задать разные лимиты для клиентов.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
