/* POS Bridge MVP */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = Number(process.env.BRIDGE_PORT || 18080);
const API = process.env.API_BASE || 'http://localhost:3000';
const DEFAULT_MERCHANT = process.env.MERCHANT_ID || 'M-1';
const DEFAULT_OUTLET = process.env.OUTLET_ID || '';
const DEFAULT_DEVICE = process.env.DEVICE_ID || '';
const STAFF_KEY = process.env.STAFF_KEY || '';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS || 5000);

const dataDir = path.join(__dirname, '..', 'data');
const queueFile = path.join(dataDir, 'queue.json');
fs.mkdirSync(dataDir, { recursive: true });

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch { return []; }
}
function saveQueue(q) {
  try { fs.writeFileSync(queueFile, JSON.stringify(q, null, 2)); } catch {}
}
let queue = loadQueue();

function reqId() { return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function signBody(secret, body) {
  const ts = Math.floor(Date.now()/1000).toString();
  const sig = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('base64');
  return { ts, sig };
}

async function callApi(pathname, bodyObj, opts = {}) {
  const id = reqId();
  const body = JSON.stringify(bodyObj || {});
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': id };
  if (STAFF_KEY) headers['X-Staff-Key'] = STAFF_KEY;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (BRIDGE_SECRET) {
    const s = signBody(BRIDGE_SECRET, body);
    headers['X-Bridge-Signature'] = `v1,ts=${s.ts},sig=${s.sig}`;
  }
  const res = await fetch(API + pathname, { method: 'POST', headers, body });
  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    const err = new Error(`API ${pathname} ${res.status} ${res.statusText} ${text}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// Queue handling
async function flushQueue() {
  const copy = [...queue];
  let changed = false;
  for (const item of copy) {
    try {
      if (item.type === 'commit') {
        await callApi('/loyalty/commit', item.body, { idempotencyKey: item.idemKey });
      } else if (item.type === 'refund') {
        await callApi('/loyalty/refund', item.body, { idempotencyKey: item.idemKey });
      } else {
        continue;
      }
      // success, remove
      queue = queue.filter(q => q.id !== item.id);
      changed = true;
    } catch (e) {
      // keep in queue
    }
  }
  if (changed) saveQueue(queue);
  return { ok: true, pending: queue.length };
}
setInterval(() => { flushQueue().catch(()=>{}); }, FLUSH_INTERVAL_MS).unref();

// API routes
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/quote', async (req, res) => {
  try {
    const b = req.body || {};
    const mode = b.mode || 'redeem';
    const merchantId = b.merchantId || DEFAULT_MERCHANT;
    const orderId = b.orderId;
    const total = Number(b.total || 0);
    const eligibleTotal = Number(b.eligibleTotal || total);
    const userToken = b.userToken || '';
    const outletId = b.outletId || DEFAULT_OUTLET || undefined;
    const deviceId = b.deviceId || DEFAULT_DEVICE || undefined;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const data = await callApi('/loyalty/quote', { mode, merchantId, orderId, total, eligibleTotal, userToken, outletId, deviceId });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/commit', async (req, res) => {
  try {
    const b = req.body || {};
    const merchantId = b.merchantId || DEFAULT_MERCHANT;
    const holdId = b.holdId;
    const orderId = b.orderId;
    const receiptNumber = b.receiptNumber || undefined;
    if (!holdId || !orderId) return res.status(400).json({ error: 'holdId and orderId required' });
    const idemKey = b.idempotencyKey || `commit:${merchantId}:${orderId}`;
    try {
      const data = await callApi('/loyalty/commit', { merchantId, holdId, orderId, receiptNumber }, { idempotencyKey: idemKey });
      res.json(data);
    } catch (e) {
      // offline enqueue
      const id = uuidv4();
      queue.push({ id, type: 'commit', idemKey, body: { merchantId, holdId, orderId, receiptNumber } });
      saveQueue(queue);
      res.status(202).json({ queued: true, id, reason: String(e.message || e) });
    }
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/refund', async (req, res) => {
  try {
    const b = req.body || {};
    const merchantId = b.merchantId || DEFAULT_MERCHANT;
    const orderId = b.orderId;
    const refundTotal = Number(b.refundTotal || 0);
    const refundEligibleTotal = b.refundEligibleTotal != null ? Number(b.refundEligibleTotal) : undefined;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const idemKey = b.idempotencyKey || `refund:${merchantId}:${orderId}:${refundTotal}`;
    try {
      const data = await callApi('/loyalty/refund', { merchantId, orderId, refundTotal, refundEligibleTotal }, { idempotencyKey: idemKey });
      res.json(data);
    } catch (e) {
      const id = uuidv4();
      queue.push({ id, type: 'refund', idemKey, body: { merchantId, orderId, refundTotal, refundEligibleTotal } });
      saveQueue(queue);
      res.status(202).json({ queued: true, id, reason: String(e.message || e) });
    }
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.post('/queue/flush', async (req, res) => {
  const r = await flushQueue();
  res.json(r);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`POS Bridge listening on http://127.0.0.1:${PORT}`);
});

