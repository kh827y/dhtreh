'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1';
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

type Receipt = { id: string; orderId: string; customerId: string; total: number; eligibleTotal: number; redeemApplied: number; earnApplied: number; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };
type Txn = { id: string; type: string; amount: number; orderId?: string|null; customerId: string; createdAt: string; outletId?: string|null; deviceId?: string|null; staffId?: string|null };
type OutboxEvent = { id: string; eventType: string; status: string; retries: number; lastError?: string|null; createdAt: string; payload: unknown };

export default function ReceiptDetail({ params }: { params: { id: string } }) {
  const receiptId = params.id;
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [events, setEvents] = useState<OutboxEvent[]>([]);
  const [msg, setMsg] = useState('');

  async function load() {
    setMsg('');
    try {
      const r = await fetch(`${API}/merchants/${MERCHANT}/receipts/${receiptId}`, { headers: { 'x-admin-key': ADMIN_KEY } });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setReceipt(data.receipt);
      setTxns(data.transactions || []);
      // загрузим события outbox по orderId
      if (data?.receipt?.orderId) {
        const e = await fetch(`${API}/merchants/${MERCHANT}/outbox/by-order?orderId=${encodeURIComponent(data.receipt.orderId)}`, { headers: { 'x-admin-key': ADMIN_KEY } });
        if (e.ok) setEvents(await e.json());
      }
    } catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); setMsg('Ошибка: ' + msg); }
  }

  useEffect(() => { load(); }, [receiptId]);

  return (
    <main style={{ maxWidth: 920, margin: '40px auto', fontFamily: 'system-ui, Arial' }}>
      <h1>Чек</h1>
      <div style={{ marginBottom: 8 }}>
        <Link href="/receipts">← К списку чеков</Link>
      </div>
      {msg && <div style={{ color: '#b00' }}>{msg}</div>}
      {receipt ? (
        <>
          <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
            <div><b>OrderId:</b> {receipt.orderId}</div>
            <div><b>Customer:</b> <code>{receipt.customerId}</code></div>
            <div><b>Totals:</b> total={receipt.total} ₽ · eligible={receipt.eligibleTotal} ₽</div>
            <div><b>Applied:</b> redeem={receipt.redeemApplied} · earn={receipt.earnApplied}</div>
            <div style={{ color: '#666' }}>Outlet: {receipt.outletId||'-'} · Device: {receipt.deviceId||'-'} · Staff: {receipt.staffId||'-'}</div>
            <div><b>Created:</b> {new Date(receipt.createdAt).toLocaleString()}</div>
          </div>
          <h3 style={{ marginTop: 16 }}>Транзакции</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {txns.map(t => (
              <div key={t.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>{t.type}</b>
                  <span>{new Date(t.createdAt).toLocaleString()}</span>
                </div>
                <div>Amount: {t.amount>0?'+':''}{t.amount} ₽ · Customer: <code>{t.customerId}</code></div>
                <div style={{ color: '#666' }}>Outlet: {t.outletId||'-'} · Device: {t.deviceId||'-'} · Staff: {t.staffId||'-'}</div>
              </div>
            ))}
            {(!txns.length) && <div style={{ color: '#666' }}>Нет транзакций</div>}
          </div>
          <h3 style={{ marginTop: 16 }}>События Outbox</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {events.map((e) => (
              <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>{e.eventType}</b>
                  <span>{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div>Status: <code>{e.status}</code> · Retries: {e.retries} {e.lastError ? <span style={{ color:'#b00' }}> · Error: {e.lastError}</span> : null}</div>
                <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto', background: '#fafafa', padding: 8 }}>{JSON.stringify(e.payload, null, 2)}</pre>
              </div>
            ))}
            {(!events.length) && <div style={{ color: '#666' }}>Нет событий</div>}
          </div>
        </>
      ) : (
        <div style={{ color: '#666' }}>Загрузка…</div>
      )}
    </main>
  );
}

