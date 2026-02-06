#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../..");
const reportsDir = resolve(repoRoot, "reports");

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const lineRaw of readFileSync(filePath, "utf8").split("\n")) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envCandidates = [
    resolve(repoRoot, ".env"),
    resolve(repoRoot, ".env.local"),
    resolve(repoRoot, ".env.production"),
    resolve(repoRoot, "api/.env"),
    resolve(repoRoot, "api/.env.local"),
  ];

  for (const candidate of envCandidates) {
    const parsed = readEnvFile(candidate);
    if (parsed.DATABASE_URL) return parsed.DATABASE_URL;
  }
  return "";
}

function collectScans(node, scans = []) {
  if (!node || typeof node !== "object") return scans;
  const nodeType = String(node["Node Type"] || "");
  const relation = String(node["Relation Name"] || "");
  if (nodeType.includes("Scan")) {
    scans.push({
      nodeType,
      relation,
      planRows: Number(node["Plan Rows"] || 0),
      actualRows: Number(node["Actual Rows"] || 0),
    });
  }
  const children = node.Plans;
  if (Array.isArray(children)) {
    for (const child of children) {
      collectScans(child, scans);
    }
  }
  return scans;
}

async function explainQuery(client, title, sql, params = []) {
  const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
  const startedAt = Date.now();
  const result = await client.query(explainSql, params);
  const elapsedMs = Date.now() - startedAt;
  const planWrapper = result.rows?.[0]?.["QUERY PLAN"]?.[0];
  const plan = planWrapper?.Plan || null;
  const executionTimeMs = Number(planWrapper?.["Execution Time"] || 0);
  const planningTimeMs = Number(planWrapper?.["Planning Time"] || 0);
  const scans = collectScans(plan, []);
  const seqScans = scans.filter((scan) => scan.nodeType === "Seq Scan");
  return {
    title,
    elapsedMs,
    planningTimeMs,
    executionTimeMs,
    scans,
    seqScans,
    sql,
    params,
  };
}

const databaseUrl = parseConnectionString();
if (!databaseUrl) {
  console.error("Missing DATABASE_URL. Set env DATABASE_URL or provide .env with DATABASE_URL.");
  process.exit(2);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const merchantRow = await client.query('SELECT id FROM "Merchant" ORDER BY "createdAt" DESC LIMIT 1');
  const merchantId = merchantRow.rows?.[0]?.id || null;
  const taskRow = await client.query('SELECT id FROM "CommunicationTask" ORDER BY "createdAt" DESC LIMIT 1');
  const taskId = taskRow.rows?.[0]?.id || null;

  const checks = [
    {
      title: "Outbox pending queue",
      sql: `
SELECT id
FROM "EventOutbox"
WHERE status = 'PENDING'
  AND "eventType" LIKE 'notify.%'
  AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
ORDER BY "createdAt" ASC
LIMIT 50
      `,
      params: [],
    },
    {
      title: "Outbox stale sending recovery",
      sql: `
SELECT id
FROM "EventOutbox"
WHERE status = 'SENDING'
  AND "eventType" LIKE 'notify.%'
  AND "updatedAt" < NOW() - interval '5 minute'
LIMIT 50
      `,
      params: [],
    },
    {
      title: "Communications due tasks",
      sql: `
SELECT id
FROM "CommunicationTask"
WHERE status = 'SCHEDULED'
  AND "archivedAt" IS NULL
  AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
ORDER BY "createdAt" ASC
LIMIT 50
      `,
      params: [],
    },
    {
      title: "Communications recipients batch",
      sql: `
SELECT id
FROM "CommunicationTaskRecipient"
WHERE "taskId" = $1
  AND status IN ('PENDING', 'FAILED')
ORDER BY id ASC
LIMIT 200
      `,
      params: taskId ? [taskId] : ["missing-task-id"],
      skip: !taskId,
      skipReason: "No CommunicationTask rows found",
    },
    {
      title: "Data import stale jobs",
      sql: `
SELECT id
FROM "DataImportJob"
WHERE status = 'PROCESSING'
  AND "startedAt" < NOW() - interval '2 hour'
ORDER BY "startedAt" ASC
LIMIT 50
      `,
      params: [],
    },
    {
      title: "Portal staff list hot path",
      sql: `
SELECT id
FROM "Staff"
WHERE "merchantId" = $1
ORDER BY "createdAt" DESC
LIMIT 200
      `,
      params: merchantId ? [merchantId] : ["missing-merchant-id"],
      skip: !merchantId,
      skipReason: "No Merchant rows found",
    },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    merchantId,
    taskId,
    checks: [],
  };

  for (const check of checks) {
    if (check.skip) {
      report.checks.push({
        title: check.title,
        skipped: true,
        reason: check.skipReason,
      });
      continue;
    }
    try {
      const explained = await explainQuery(client, check.title, check.sql, check.params);
      report.checks.push({
        ...explained,
        skipped: false,
      });
    } catch (error) {
      report.checks.push({
        title: check.title,
        skipped: false,
        error: String(error?.message || error),
      });
    }
  }

  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(resolve(reportsDir, "sql-hotpath-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const mdLines = [
    "# SQL Hot Path Report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Sample merchantId: ${merchantId || "(none)"}`,
    `- Sample communicationTaskId: ${taskId || "(none)"}`,
    "",
  ];

  for (const check of report.checks) {
    mdLines.push(`## ${check.title}`);
    if (check.skipped) {
      mdLines.push("", `Skipped: ${check.reason || "no reason"}`, "");
      continue;
    }
    if (check.error) {
      mdLines.push("", `Error: ${check.error}`, "");
      continue;
    }
    mdLines.push(
      "",
      `- Planning time: ${Number(check.planningTimeMs || 0).toFixed(3)} ms`,
      `- Execution time: ${Number(check.executionTimeMs || 0).toFixed(3)} ms`,
      `- Elapsed (script): ${Number(check.elapsedMs || 0).toFixed(3)} ms`,
      `- Seq scans: ${(check.seqScans || []).length}`,
    );
    if (Array.isArray(check.seqScans) && check.seqScans.length) {
      mdLines.push("- Seq scan details:");
      for (const seq of check.seqScans) {
        mdLines.push(
          `  - ${seq.relation || "(unknown relation)"} rows(plan=${seq.planRows}, actual=${seq.actualRows})`,
        );
      }
    }
    mdLines.push("");
  }

  writeFileSync(resolve(reportsDir, "sql-hotpath-report.md"), `${mdLines.join("\n")}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
