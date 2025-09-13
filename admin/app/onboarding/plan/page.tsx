"use client";
import { useEffect, useState } from 'react';
import { getPlans, createSubscription, getSubscription, createSubscriptionPayment } from '../../../lib/admin';

export default function PlanPage() {
  const [merchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [plans, setPlans] = useState<any[]>([]);
  const [sub, setSub] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPlans().then(setPlans).catch(e=>setMsg(String(e?.message||e)));
    getSubscription(merchantId).then(setSub).catch(()=>{});
  }, [merchantId]);

  const pick = async (planId: string) => {
    try {
      const res = await createSubscription(merchantId, planId, 14);
      setSub(res);
      setMsg('Подписка создана. Доступен пробный период 14 дней.');
    } catch (e:any) {
      setMsg('Ошибка создания подписки: ' + (e.message || e));
    }
  };

  const pay = async () => {
    if (!sub?.id) {
      setMsg('Сначала создайте подписку');
      return;
    }
    try {
      setLoading(true);
      const p = await createSubscriptionPayment(merchantId, sub.id);
      if (p.confirmationUrl) {
        // редирект на платежную страницу
        window.location.href = p.confirmationUrl;
      } else {
        setMsg(`Платеж создан: ${p.paymentId}, статус: ${p.status}`);
      }
    } catch (e:any) {
      setMsg('Ошибка создания платежа: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>Шаг 2. Тариф и реквизиты</h3>
      {sub ? (
        <div>
          <div>Текущая подписка: <b>{sub.plan?.displayName || sub.planId}</b>, статус: {sub.status}</div>
          <div>Период до: {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleString() : '—'}</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={pay} disabled={loading}>
              {loading ? 'Создаем платеж…' : 'Оплатить / Продлить'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p>Выберите тарифный план:</p>
          <ul>
            {plans.map(p => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                <b>{p.displayName || p.name}</b> — {(p.price/100).toFixed(2)} {p.currency}
                <button onClick={()=>pick(p.id)} style={{ marginLeft: 8 }}>Выбрать</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
