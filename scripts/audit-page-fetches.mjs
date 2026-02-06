#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports');
const JSON_REPORT = path.join(REPORTS_DIR, 'page-fetch-audit.json');
const MD_REPORT = path.join(REPORTS_DIR, 'page-fetch-audit.md');

const APPS = [
  {
    name: 'admin',
    root: 'admin/src/app',
    base: 'admin/src/app',
    extraFiles: ['admin/src/app/layout.tsx'],
  },
  {
    name: 'merchant-portal',
    root: 'merchant-portal/src/app',
    base: 'merchant-portal/src/app',
    extraFiles: ['merchant-portal/src/app/layout.tsx'],
  },
  {
    name: 'cashier',
    root: 'cashier/src/app',
    base: 'cashier/src/app',
    extraFiles: ['cashier/src/app/layout.tsx'],
  },
  {
    name: 'miniapp',
    root: 'miniapp/src/app',
    base: 'miniapp/src/app',
    extraFiles: ['miniapp/src/app/layout.tsx'],
  },
];

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function routeFromPageFile(baseDir, filePath) {
  const rel = path.posix.relative(baseDir, filePath).replace(/\\/g, '/');
  if (rel === 'page.tsx') return '/';
  const noPage = rel.replace(/\/page\.tsx$/, '');
  return `/${noPage}`;
}

function normalizeEndpoint(raw) {
  if (!raw) return raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    return raw;
  }
  return raw.split('?')[0] || raw;
}

function analyzeSource(filePath) {
  const source = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  const lines = source.split(/\r?\n/);

  const fetchCalls = [];
  const fetchAnyRegex = /\bfetch\s*\(/g;
  const fetchLiteralRegex = /\bfetch\s*\(\s*(['"`])([^'"`]+)\1/g;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    fetchAnyRegex.lastIndex = 0;
    fetchLiteralRegex.lastIndex = 0;
    if (!fetchAnyRegex.test(line)) continue;

    let m;
    const literals = [];
    while ((m = fetchLiteralRegex.exec(line)) !== null) {
      literals.push(m[2]);
    }
    fetchCalls.push({
      line: i + 1,
      literalEndpoints: literals,
      hasLiteral: literals.length > 0,
      raw: line.trim(),
    });
  }

  const literalEndpoints = fetchCalls.flatMap((c) => c.literalEndpoints);
  const endpointCounts = new Map();
  for (const endpoint of literalEndpoints) {
    const key = normalizeEndpoint(endpoint);
    endpointCounts.set(key, (endpointCounts.get(key) || 0) + 1);
  }
  const duplicateEndpoints = [...endpointCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count);

  const awaitFetchCount =
    source.match(/\bawait\s+fetch\s*\(/g)?.length ?? 0;
  const promiseAllCount =
    source.match(/\bPromise\.(all|allSettled)\s*\(/g)?.length ?? 0;
  const potentialWaterfall = awaitFetchCount >= 2 && promiseAllCount === 0;

  return {
    filePath,
    fetchCount: fetchCalls.length,
    awaitFetchCount,
    promiseAllCount,
    potentialWaterfall,
    literalEndpoints: [...new Set(literalEndpoints)],
    duplicateEndpoints,
    calls: fetchCalls,
  };
}

function collectPageFiles(rootDir) {
  const output = run(`rg --files ${rootDir} | rg 'page\\.tsx$'`);
  return output ? output.split('\n').filter(Boolean) : [];
}

function maybeAnalyzeExtraFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return analyzeSource(filePath);
}

function riskScore(item) {
  let score = 0;
  if (item.potentialWaterfall) score += 2;
  if (item.duplicateEndpoints.length > 0) score += 2;
  if (item.fetchCount >= 6) score += 1;
  if (item.awaitFetchCount >= 4) score += 1;
  return score;
}

function riskLabel(score) {
  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    apps: {},
    summary: {
      totalPages: 0,
      totalFetchCalls: 0,
      highRiskPages: 0,
      mediumRiskPages: 0,
      lowRiskPages: 0,
      pagesWithPotentialWaterfall: 0,
      pagesWithDuplicateEndpoints: 0,
    },
  };

  for (const app of APPS) {
    const pageFiles = collectPageFiles(app.root);
    const pages = pageFiles.map((filePath) => {
      const analysis = analyzeSource(filePath);
      const route = routeFromPageFile(app.base, filePath);
      const score = riskScore(analysis);
      const risk = riskLabel(score);
      return {
        route,
        score,
        risk,
        ...analysis,
      };
    });

    const extras = app.extraFiles
      .map((filePath) => maybeAnalyzeExtraFile(filePath))
      .filter(Boolean)
      .map((analysis) => {
        const score = riskScore(analysis);
        const risk = riskLabel(score);
        return {
          route: '(shared-layout)',
          score,
          risk,
          ...analysis,
        };
      });

    const appSummary = {
      pageCount: pages.length,
      pageFetchCalls: pages.reduce((sum, page) => sum + page.fetchCount, 0),
      layoutFetchCalls: extras.reduce((sum, page) => sum + page.fetchCount, 0),
      highRiskPages: [...pages, ...extras].filter((p) => p.risk === 'high')
        .length,
      mediumRiskPages: [...pages, ...extras].filter((p) => p.risk === 'medium')
        .length,
      lowRiskPages: [...pages, ...extras].filter((p) => p.risk === 'low')
        .length,
      potentialWaterfalls: [...pages, ...extras].filter(
        (p) => p.potentialWaterfall,
      ).length,
      duplicateEndpointPages: [...pages, ...extras].filter(
        (p) => p.duplicateEndpoints.length > 0,
      ).length,
    };

    report.apps[app.name] = {
      summary: appSummary,
      pages,
      extras,
    };

    report.summary.totalPages += pages.length;
    report.summary.totalFetchCalls += appSummary.pageFetchCalls;
    report.summary.highRiskPages += appSummary.highRiskPages;
    report.summary.mediumRiskPages += appSummary.mediumRiskPages;
    report.summary.lowRiskPages += appSummary.lowRiskPages;
    report.summary.pagesWithPotentialWaterfall += appSummary.potentialWaterfalls;
    report.summary.pagesWithDuplicateEndpoints += appSummary.duplicateEndpointPages;
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(JSON_REPORT, JSON.stringify(report, null, 2));

  const markdown = [];
  markdown.push('# Page Fetch Audit');
  markdown.push('');
  markdown.push(`Generated: ${report.generatedAt}`);
  markdown.push('');
  markdown.push('## Overall');
  markdown.push('');
  markdown.push(`- Total pages: ${report.summary.totalPages}`);
  markdown.push(`- Total page-level fetch calls: ${report.summary.totalFetchCalls}`);
  markdown.push(`- High risk entries: ${report.summary.highRiskPages}`);
  markdown.push(`- Medium risk entries: ${report.summary.mediumRiskPages}`);
  markdown.push(`- Low risk entries: ${report.summary.lowRiskPages}`);
  markdown.push(
    `- Potential waterfall entries: ${report.summary.pagesWithPotentialWaterfall}`,
  );
  markdown.push(
    `- Entries with duplicate literal endpoints: ${report.summary.pagesWithDuplicateEndpoints}`,
  );
  markdown.push('');

  for (const [appName, appData] of Object.entries(report.apps)) {
    markdown.push(`## ${appName}`);
    markdown.push('');
    markdown.push(`- Pages: ${appData.summary.pageCount}`);
    markdown.push(`- Page-level fetch calls: ${appData.summary.pageFetchCalls}`);
    markdown.push(`- Shared layout fetch calls: ${appData.summary.layoutFetchCalls}`);
    markdown.push(`- High risk entries: ${appData.summary.highRiskPages}`);
    markdown.push(`- Potential waterfalls: ${appData.summary.potentialWaterfalls}`);
    markdown.push('');

    const sorted = [...appData.pages, ...appData.extras].sort(
      (a, b) => b.score - a.score || b.fetchCount - a.fetchCount,
    );
    markdown.push('| Route | File | Fetch | Await Fetch | Promise.all | Risk | Notes |');
    markdown.push('|---|---|---:|---:|---:|---|---|');
    for (const item of sorted) {
      const notes = [];
      if (item.potentialWaterfall) notes.push('potential-waterfall');
      if (item.duplicateEndpoints.length > 0) {
        notes.push(`duplicates:${item.duplicateEndpoints.length}`);
      }
      markdown.push(
        `| ${item.route} | ${item.filePath} | ${item.fetchCount} | ${item.awaitFetchCount} | ${item.promiseAllCount} | ${item.risk} | ${notes.join(', ') || '-'} |`,
      );
    }
    markdown.push('');
  }

  fs.writeFileSync(MD_REPORT, `${markdown.join('\n')}\n`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ json: JSON_REPORT, md: MD_REPORT }, null, 2));
}

main();
