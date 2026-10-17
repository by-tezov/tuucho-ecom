import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Classic dark theme for Patchright's HTML report — dark canvas, light text,
 * readable contrast (GitHub-style dark, forced on regardless of OS theme). */
const PAM_REPORT_THEME = `
<style id="pam-report-theme">
  :root,
  :root.light-mode,
  :root.dark-mode {
    color-scheme: dark !important;
    --color-canvas-default: #0d1117 !important;
    --color-canvas-overlay: #161b22 !important;
    --color-canvas-inset: #010409 !important;
    --color-canvas-subtle: #161b22 !important;
    --color-fg-default: #e6edf3 !important;
    --color-fg-muted: #9da7b3 !important;
    --color-fg-subtle: #6e7681 !important;
    --color-fg-on-emphasis: #ffffff !important;
    --color-border-default: #30363d !important;
    --color-border-muted: #21262d !important;
    --color-neutral-muted: #6e768166 !important;
    --color-accent-fg: #58a6ff !important;
    --color-accent-emphasis: #1f6feb !important;
    --color-success-fg: #3fb950 !important;
    --color-danger-fg: #f85149 !important;
    --color-attention-fg: #d29922 !important;
  }
  html,
  body {
    background-color: #0d1117 !important;
    color: #e6edf3 !important;
  }
</style>
<script id="pam-report-theme-boot">
  try { localStorage.setItem('theme', 'dark-mode'); } catch (_) {}
  document.documentElement.classList.remove('light-mode');
  document.documentElement.classList.add('dark-mode');
</script>
`.trim();

/** Patch Patchright's generated index.html for a readable classic dark theme. */
export function patchHtmlReport(reportDir: string): void {
  const indexPath = join(reportDir, 'index.html');
  if (!existsSync(indexPath)) return;
  let html = readFileSync(indexPath, 'utf8');
  html = html
    .replace(/<style id="pam-report-theme">[\s\S]*?<\/style>\s*/g, '')
    .replace(/<script id="pam-report-theme-boot">[\s\S]*?<\/script>\s*/g, '');
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${PAM_REPORT_THEME}\n</head>`);
  } else {
    html = `${PAM_REPORT_THEME}\n${html}`;
  }
  writeFileSync(indexPath, html);
}
