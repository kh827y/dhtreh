#!/usr/bin/env node
const http = require('http');
const https = require('https');
require('dotenv').config();

const host = process.env.BRIDGE_HOST || '127.0.0.1';
const port = Number(process.env.BRIDGE_PORT || 18080);
const base = `http://${host}:${port}`;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const opt = new URL(base + path);
    const opts = { method, hostname: opt.hostname, port: opt.port, path: opt.pathname + (opt.search||''), headers: {} };
    if (data) opts.headers['Content-Type'] = 'application/json';
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); } catch { resolve(text); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${text}`));
        }
      });
    });
    r.on('error', reject);
    if (data) r.end(data); else r.end();
  });
}

function reqAbs(method, urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const u = new URL(urlStr);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
    };
    const agent = u.protocol === 'https:' ? https : http;
    const r = agent.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(text)); } catch { resolve(text); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${text}`));
        }
      });
    });
    r.on('error', reject);
    if (data) r.end(data); else r.end();
  });
}

async function main() {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'flush') {
    const r = await req('POST', '/queue/flush');
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'status') {
    const r = await req('GET', '/queue/status');
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'sign-test') {
    // Usage: BRIDGE_SECRET=... bridge-cli.js sign-test '{"merchantId":"M-1"}'
    const body = process.argv[3] || '{}';
    const secret = process.env.BRIDGE_SECRET || '';
    if (!secret) {
      console.error('BRIDGE_SECRET not set');
      process.exit(2);
    }
    const ts = Math.floor(Date.now()/1000).toString();
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', secret).update(ts + '.' + body).digest('base64');
    console.log(`v1,ts=${ts},sig=${sig}`);
  } else if (cmd === 'secret-status') {
    const apiBase = process.env.API_BASE || '';
    const adminKey = process.env.ADMIN_KEY || '';
    const merchantId = process.env.MERCHANT_ID || '';
    if (!apiBase || !adminKey || !merchantId) {
      console.error('API_BASE, ADMIN_KEY, MERCHANT_ID must be set');
      process.exit(2);
    }
    const url = `${apiBase.replace(/\/$/, '')}/merchants/${encodeURIComponent(merchantId)}/outlets`;
    const outlets = await reqAbs('GET', url, null, { 'X-Admin-Key': adminKey });
    console.log(JSON.stringify({
      merchantId,
      outlets: outlets.map(o => ({
        id: o.id,
        posType: o.posType || null,
        status: o.status,
        bridgeSecretIssued: !!o.bridgeSecretIssued,
        bridgeSecretNextIssued: !!o.bridgeSecretNextIssued,
        bridgeSecretUpdatedAt: o.bridgeSecretUpdatedAt || null,
      })),
    }, null, 2));
  } else if (cmd === 'rotate-secret') {
    const apiBase = process.env.API_BASE || '';
    const adminKey = process.env.ADMIN_KEY || '';
    const merchantId = process.env.MERCHANT_ID || '';
    const outletId = process.argv[3];
    const target = process.argv[4];
    const next = target === '--next' || target === 'next';
    if (!apiBase || !adminKey || !merchantId || !outletId) {
      console.error('Usage: rotate-secret <outletId> [next] (requires API_BASE, ADMIN_KEY, MERCHANT_ID env)');
      process.exit(2);
    }
    const url = `${apiBase.replace(/\/$/, '')}/merchants/${encodeURIComponent(merchantId)}/outlets/${encodeURIComponent(outletId)}/bridge-secret${next ? '/next' : ''}`;
    const result = await reqAbs('POST', url, null, { 'X-Admin-Key': adminKey });
    console.log(JSON.stringify({ ok: true, outletId, target: next ? 'bridgeSecretNext' : 'bridgeSecret', secret: result.secret }, null, 2));
  } else {
    console.log('Usage: bridge-cli.js [status|flush|sign-test JSON|secret-status|rotate-secret <outletId> [next]]');
    process.exit(2);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });

