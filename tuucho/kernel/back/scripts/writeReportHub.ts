/**
 * Regenerates output/report/index.html, a small hub linking suite HTML reports
 * that already exist on disk.
 *
 *   npx tsx scripts/writeReportHub.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportRoot } from './reportPaths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type HubLink = {
  href: string;
  title: string;
  note?: string;
};

function linkIfPresent(relIndex: string, title: string, note?: string): HubLink | null {
  const abs = join(reportRoot(root), relIndex);
  if (!existsSync(abs)) return null;
  return { href: relIndex, title, note };
}

/** Write (or refresh) the hub at output/report/index.html. */
export function writeReportHub(repoRoot: string = root): string {
  const outDir = reportRoot(repoRoot);
  mkdirSync(outDir, { recursive: true });

  const links = [
    linkIfPresent('coverage/back/index.html', 'Coverage (back)', 'c8 / unit-test'),
    linkIfPresent('coverage/front/index.html', 'Coverage (front)', 'Vitest'),
  ].filter((entry): entry is HubLink => entry !== null);

  const rows =
    links.length === 0
      ? `<p class="empty">No reports yet. Run a suite, then refresh this page.</p>`
      : `<ul class="list">${links
          .map(
            (link) =>
              `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.title)}</a>` +
              (link.note ? `<span class="note">${escapeHtml(link.note)}</span>` : '') +
              `</li>`,
          )
          .join('\n')}</ul>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Shop test reports</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --card: #161b22;
    --fg: #e6edf3;
    --muted: #9da7b3;
    --accent: #58a6ff;
    --border: #30363d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.5 system-ui, sans-serif;
    background: var(--bg);
    color: var(--fg);
    padding: 32px 20px 48px;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  .sub { color: var(--muted); margin: 0 0 28px; font-size: 0.9375rem; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .list li {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  a { color: var(--accent); font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .note { color: var(--muted); font-size: 0.8125rem; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Shop test reports</h1>
  <p class="sub">Latest HTML reports under <code>output/report/</code>.</p>
  ${rows}
</main>
</body>
</html>
`;

  const indexPath = join(outDir, 'index.html');
  writeFileSync(indexPath, html);
  return indexPath;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('writeReportHub.ts') || process.argv[1].endsWith('writeReportHub.js'));

if (isDirectRun) {
  const path = writeReportHub();
  console.error(`[report] hub: ${path}`);
}
