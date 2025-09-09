#!/usr/bin/env node
const fs = require('fs');

async function main() {
  const base = process.env.API_BASE || 'http://localhost:3000';
  const outDir = process.env.OUT_DIR || process.cwd();
  const openapiUrl = `${base}/openapi.json`;
  const postmanUrl = `${base}/postman.json`;
  console.log('[postman] Fetching', openapiUrl);
  const openapiRes = await fetch(openapiUrl);
  if (!openapiRes.ok) throw new Error(`Failed to fetch openapi: ${openapiRes.status} ${openapiRes.statusText}`);
  const openapi = await openapiRes.json();
  fs.writeFileSync(`${outDir}/openapi.generated.json`, JSON.stringify(openapi, null, 2));
  console.log('[postman] Fetching', postmanUrl);
  const postmanRes = await fetch(postmanUrl);
  if (!postmanRes.ok) throw new Error(`Failed to fetch postman: ${postmanRes.status} ${postmanRes.statusText}`);
  const postman = await postmanRes.json();
  fs.writeFileSync(`${outDir}/postman.collection.json`, JSON.stringify(postman, null, 2));
  console.log('[postman] Wrote postman.collection.json and openapi.generated.json');
}

main().catch((e) => { console.error(e); process.exit(1); });

