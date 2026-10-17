/**
 * Build a readable dark HTML summary from k6 `--summary-export` JSON.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type MetricValues = Record<string, number | undefined>;
type MetricEntry = {
  type?: string;
  contains?: string;
  values?: MetricValues;
  thresholds?: Record<string, boolean>;
};

type CheckEntry = {
  name: string;
  path: string;
  id: string;
  passes: number;
  fails: number;
};

type SummaryExport = {
  metrics?: Record<string, MetricEntry>;
  root_group?: {
    name?: string;
    path?: string;
    /** k6 historically exported an array; recent versions export a name→check map. */
    checks?: CheckEntry[] | Record<string, CheckEntry>;
    groups?: unknown[];
  };
};

function listChecks(raw: SummaryExport['root_group']): CheckEntry[] {
  const checks = raw?.checks;
  if (!checks) return [];
  if (Array.isArray(checks)) return checks;
  return Object.values(checks);
}

function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || Number.isNaN(n)) return '-';
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function fmtMs(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '-';
  return `${fmt(n, 1)} ms`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type InvariantEntry = { name: string; description: string; ok: boolean; violations: unknown[] };
type DbMetricsEntry = {
  peak?: Record<string, number>;
  deadlocks?: number;
  rateLimitBuckets?: number;
  samples?: unknown[];
};

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Post-run SQL invariants and database pressure, written by
 * scripts/loadIntegrity.ts next to summary.json. */
function integrityHtml(loadDir: string): string {
  const invariants = readJson<InvariantEntry[]>(join(loadDir, 'invariants.json'));
  const db = readJson<DbMetricsEntry>(join(loadDir, 'db-metrics.json'));
  const invariantTable = !invariants
    ? '<p class="muted">No invariants.json for this run.</p>'
    : `<table>
<thead><tr><th>Invariant</th><th>Rule</th><th>Result</th></tr></thead>
<tbody>
${invariants
  .map(
    (row) => `<tr>
  <td><code>${escapeHtml(row.name)}</code></td>
  <td>${escapeHtml(row.description)}${
    row.ok ? '' : `<br /><code>${escapeHtml(JSON.stringify(row.violations).slice(0, 2_000))}</code>`
  }</td>
  <td class="${row.ok ? 'ok' : 'bad'}">${row.ok ? 'held' : 'broken'}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`;
  const dbTable = !db
    ? '<p class="muted">No db-metrics.json for this run.</p>'
    : `<table>
<thead><tr><th>Database</th><th class="num">Peak</th></tr></thead>
<tbody>
${Object.entries(db.peak ?? {})
  .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td class="num">${fmt(value, 0)}</td></tr>`)
  .join('\n')}
<tr><td>deadlocks during run</td><td class="num ${db.deadlocks ? 'bad' : 'ok'}">${fmt(db.deadlocks, 0)}</td></tr>
<tr><td>rate_limit_buckets rows at end</td><td class="num">${fmt(db.rateLimitBuckets, 0)}</td></tr>
<tr><td>samples</td><td class="num">${fmt(db.samples?.length, 0)}</td></tr>
</tbody></table>`;
  return `<h2>Invariants</h2>
  ${invariantTable}

  <h2>Database pressure</h2>
  ${dbTable}`;
}

/** Write output/report/load/index.html from an existing summary.json. */
export function writeLoadHtmlReport(loadDir: string): string | null {
  const summaryPath = join(loadDir, 'summary.json');
  if (!existsSync(summaryPath)) return null;

  let summary: SummaryExport;
  try {
    summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as SummaryExport;
  } catch {
    return null;
  }

  const metrics = summary.metrics ?? {};
  const checks = listChecks(summary.root_group);

  const httpReqs = metrics.http_reqs?.values;
  const httpFailed = metrics.http_req_failed?.values;
  const duration = metrics.http_req_duration?.values;
  const iterations = metrics.iterations?.values;
  const vus = metrics.vus?.values;
  const vusMax = metrics.vus_max?.values;
  const dataReceived = metrics.data_received?.values;
  const dataSent = metrics.data_sent?.values;

  const thresholdRows: Array<{ metric: string; name: string; ok: boolean }> = [];
  for (const [metricName, entry] of Object.entries(metrics)) {
    if (!entry.thresholds) continue;
    // --summary-export flags a threshold `true` when it was crossed.
    for (const [rule, crossed] of Object.entries(entry.thresholds)) {
      thresholdRows.push({ metric: metricName, name: rule, ok: !crossed });
    }
  }

  const preferredMetricNames = [
    'http_reqs',
    'http_req_failed',
    'http_req_duration',
    'iteration_duration',
    'iterations',
    'vus',
    'vus_max',
    'checks',
    'data_received',
    'data_sent',
  ];
  const metricNames = [
    ...preferredMetricNames.filter((name) => name in metrics),
    ...Object.keys(metrics)
      .filter((name) => !preferredMetricNames.includes(name))
      .sort(),
  ];

  const checkRows = checks
    .map((check) => {
      const total = check.passes + check.fails;
      const rate = total === 0 ? 0 : (100 * check.passes) / total;
      const ok = check.fails === 0;
      return `<tr>
  <td>${escapeHtml(check.name)}</td>
  <td class="num">${fmt(check.passes, 0)}</td>
  <td class="num">${fmt(check.fails, 0)}</td>
  <td class="num">${fmt(rate, 1)}%</td>
  <td class="${ok ? 'ok' : 'bad'}">${ok ? 'pass' : 'fail'}</td>
</tr>`;
    })
    .join('\n');

  const thresholdHtml =
    thresholdRows.length === 0
      ? '<p class="muted">No thresholds recorded in this export.</p>'
      : `<table>
<thead><tr><th>Metric</th><th>Rule</th><th>Result</th></tr></thead>
<tbody>
${thresholdRows
  .map(
    (row) => `<tr>
  <td><code>${escapeHtml(row.metric)}</code></td>
  <td><code>${escapeHtml(row.name)}</code></td>
  <td class="${row.ok ? 'ok' : 'bad'}">${row.ok ? 'pass' : 'fail'}</td>
</tr>`,
  )
  .join('\n')}
</tbody></table>`;

  const metricRows = metricNames
    .map((name) => {
      const entry = metrics[name];
      if (!entry?.values) return '';
      const vals = entry.values;
      const parts = Object.entries(vals)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${escapeHtml(k)}=${fmt(v as number)}`)
        .join(', ');
      return `<tr><td><code>${escapeHtml(name)}</code></td><td>${parts}</td></tr>`;
    })
    .filter(Boolean)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>k6 load report</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --card: #161b22;
    --fg: #e6edf3;
    --muted: #9da7b3;
    --accent: #58a6ff;
    --ok: #3fb950;
    --bad: #f85149;
    --border: #30363d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 15px/1.5 system-ui, sans-serif;
    background: var(--bg);
    color: var(--fg);
    padding: 28px 18px 48px;
  }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 6px; }
  h2 { font-size: 1.05rem; margin: 28px 0 10px; }
  .sub, .muted { color: var(--muted); }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin: 18px 0 8px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .card .label { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 1.25rem; font-weight: 650; margin-top: 4px; }
  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  th, td { padding: 8px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ok { color: var(--ok); font-weight: 600; }
  .bad { color: var(--bad); font-weight: 600; }
  code { font-size: 0.875em; }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
  <p class="sub"><a href="../index.html">← All reports</a></p>
  <h1>k6 load report</h1>
  <p class="sub">Generated from <code>summary.json</code>.</p>

  <div class="cards">
    <div class="card"><div class="label">HTTP requests</div><div class="value">${fmt(httpReqs?.count, 0)}</div></div>
    <div class="card"><div class="label">Req/s</div><div class="value">${fmt(httpReqs?.rate)}</div></div>
    <div class="card"><div class="label">Failed rate</div><div class="value">${httpFailed?.rate === undefined ? '-' : `${fmt((httpFailed.rate as number) * 100, 2)}%`}</div></div>
    <div class="card"><div class="label">Duration p95</div><div class="value">${fmtMs(duration?.['p(95)'])}</div></div>
    <div class="card"><div class="label">Duration avg</div><div class="value">${fmtMs(duration?.avg)}</div></div>
    <div class="card"><div class="label">Iterations</div><div class="value">${fmt(iterations?.count, 0)}</div></div>
    <div class="card"><div class="label">VUs (max)</div><div class="value">${fmt(vusMax?.value ?? vus?.max ?? vus?.value, 0)}</div></div>
    <div class="card"><div class="label">Data in / out</div><div class="value">${fmt(dataReceived?.count, 0)} / ${fmt(dataSent?.count, 0)}</div></div>
  </div>

  ${integrityHtml(loadDir)}

  <h2>Thresholds</h2>
  ${thresholdHtml}

  <h2>Checks</h2>
  ${
    checks.length === 0
      ? '<p class="muted">No named checks in this export.</p>'
      : `<table>
<thead><tr><th>Check</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Rate</th><th>Result</th></tr></thead>
<tbody>
${checkRows}
</tbody></table>`
  }

  <h2>All metrics</h2>
  <table>
<thead><tr><th>Metric</th><th>Values</th></tr></thead>
<tbody>
${metricRows || '<tr><td colspan="2" class="muted">No metrics.</td></tr>'}
</tbody></table>
</main>
</body>
</html>
`;

  mkdirSync(loadDir, { recursive: true });
  const indexPath = join(loadDir, 'index.html');
  writeFileSync(indexPath, html);
  return indexPath;
}
