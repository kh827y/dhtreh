#!/usr/bin/env node
const http = require('http');

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

async function main() {
  const cmd = process.argv[2] || 'status';
  if (cmd === 'flush') {
    const r = await req('POST', '/queue/flush');
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'status') {
    const r = await req('GET', '/queue/status');
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log('Usage: bridge-cli.js [status|flush]');
    process.exit(2);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });

