import Handlebars from 'handlebars';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Language } from '../../../utils/language.js';
import { peekStoreIdentity } from '../../plugins/application/storeSettings.js';
import { emailStrings } from './emailStrings.js';

/** Assets live at the source root (`src/templates/emails`) and are copied to
 * the artifact root (`dist/vX.Y.Z/templates/emails`) by scripts/build.mjs, so
 * the same three-level climb out of `modules/messaging/application/` resolves
 * in dev under tsx and in a compiled release. In the deployed server bundle
 * (`dist/vX.Y.Z/bundle/serverEntry.js`, see scripts/build.mjs) this code runs
 * one level below the artifact root instead, hence the second candidate.
 *
 * Counted from this file's directory, not guessed: moving this file changes
 * the depth, and getting it wrong throws only when an email is first rendered.
 * emailTemplates.test.ts renders every template so that failure is caught by
 * `npm run test:unit` instead of by a customer. */
const moduleDir = dirname(fileURLToPath(import.meta.url));
const templatesDir =
  [join(moduleDir, '..', '..', '..', 'templates', 'emails'), join(moduleDir, '..', 'templates', 'emails')].find(
    (candidate) => existsSync(candidate),
  ) ?? join(moduleDir, '..', '..', '..', 'templates', 'emails');

const PARTIAL_NAMES = ['header', 'footer', 'orderItemsTable', 'orderTotals', 'shippingAddress'] as const;

export const SPY_FOOTER = 'Copie automatique envoyée au propriétaire du site (Shop).';

/** The footer's "handmade with care" line, in the email's own language. */
const BRAND_TAGLINE: Record<Language, string> = {
  fr: 'Fait main avec soin',
  en: 'Handmade with care',
};

/** "Sent automatically, please do not reply", in `language`. */
export function automaticEmailFooter(language: Language): string {
  return emailStrings(language).orderConfirmation.footer;
}

let initialized = false;

function initializeOnce(): void {
  if (initialized) return;
  Handlebars.registerHelper('money', (value: number) => `${Number(value).toFixed(2)} €`);
  for (const name of PARTIAL_NAMES) {
    Handlebars.registerPartial(name, readFileSync(join(templatesDir, 'partials', `${name}.hbs`), 'utf-8'));
  }
  initialized = true;
}

const compiledTemplates = new Map<string, HandlebarsTemplateDelegate>();

/** Compiles (and caches) one of the top-level .hbs files in
 * src/templates/emails/ — the shared partials/helpers above are registered
 * once, lazily, on first use.
 *
 * Returns a whole HTML document whose `<html lang>` is `language`, the
 * language the email is written in, so a mail client or screen reader reads
 * it with the right voice. No `<title>`: in an email the subject line is the
 * title, which HTML allows. */
export function renderEmailTemplate(name: string, language: Language, context: object): string {
  initializeOnce();
  let template = compiledTemplates.get(name);
  if (!template) {
    template = Handlebars.compile(readFileSync(join(templatesDir, `${name}.hbs`), 'utf-8'));
    compiledTemplates.set(name, template);
  }
  const body = template({
    brandTagline: BRAND_TAGLINE[language],
    shopName: peekStoreIdentity().name,
    ...context,
  });
  if (body.includes('[object Object]')) {
    throw new Error(`${name} interpolated an object into HTML`);
  }
  return [
    '<!DOCTYPE html>',
    `<html lang="${language}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head>',
    '<body style="margin:0;padding:0;">',
    body.trimEnd(),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Shared by every plain-notice email — one paragraph-based HTML template
 * (see templates/emails/genericNotice.hbs) instead of five near-identical
 * ones. `language` is the language of the title and paragraphs, French
 * when omitted; the footer follows it. */
export function genericNoticeHtml(params: {
  language?: Language;
  title: string;
  paragraphs: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  ctaFallbackHint?: string;
  secondaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaFallbackHint?: string;
  otp?: string;
  otpHint?: string;
}): string {
  const { language = 'fr', ...context } = params;
  return renderEmailTemplate('genericNotice', language, {
    ...context,
    footer: automaticEmailFooter(language),
  });
}

/** Shared by every spy email — a key/value field table plus optional plain
 * lines (see templates/emails/spyNotice.hbs). Always French: the site owner's
 * own notifications. */
export function spyNoticeHtml(params: {
  title: string;
  fields: { label: string; value: string }[];
  lines?: string[];
}): string {
  return renderEmailTemplate('spyNotice', 'fr', { ...params, footer: SPY_FOOTER });
}
