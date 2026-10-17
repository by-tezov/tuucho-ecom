/**
 * One-shot owner spy for the keep-warm cron failure path. Runs outside
 * Passenger (release Node + SMTP) so a down public API can still mail.
 *
 *   node warmOutageSpy.js --kind website_down|website_restore_failed \
 *     --url <healthzUrl> [--http-status N] [--curl-status N] [--note "..."]
 *
 * To is `tuucho-mail-spy` (`spyTo` for website_down / website_restore_failed).
 * When plugins/DB cannot load, the last resolved To is read from
 * `$PRIVATE_DIR/warm-outage/spy-recipients.json`. SMTP_HOST /
 * EMAIL_NO_REPLY_FROM stay env (transport). DISABLE_SPY_EMAIL still skips.
 */
import nodemailer from 'nodemailer';
import './config/env.js';
import { config } from './config/env.js';
import { renderEmailTemplate } from './modules/messaging/application/emailTemplates.js';
import { liveOrCachedOutageSpyTo } from './modules/messaging/application/spyChannels.js';

const SPY_FOOTER = 'Copie automatique envoyée au propriétaire du site. Shop.';

type Kind = 'website_down' | 'website_restore_failed';

function usage(message: string): never {
  console.error(`[warm-outage-spy] ${message}`);
  console.error(
    '[warm-outage-spy] usage: warmOutageSpy.js --kind website_down|website_restore_failed --url <url> [--http-status N] [--curl-status N] [--note text]',
  );
  process.exit(1);
}

function parseArgs(argv: string[]): {
  kind: Kind;
  url: string;
  httpStatus: string;
  curlStatus: string;
  note: string | undefined;
} {
  let kind: Kind | undefined;
  let url: string | undefined;
  let httpStatus = 'unknown';
  let curlStatus = 'unknown';
  let note: string | undefined;
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift()!;
    if (token === '--kind') {
      const value = rest.shift();
      if (value !== 'website_down' && value !== 'website_restore_failed') {
        usage(`invalid --kind "${value ?? ''}"`);
      }
      kind = value;
    } else if (token === '--url') {
      url = rest.shift();
    } else if (token === '--http-status') {
      httpStatus = rest.shift() ?? 'unknown';
    } else if (token === '--curl-status') {
      curlStatus = rest.shift() ?? 'unknown';
    } else if (token === '--note') {
      note = rest.shift();
    } else {
      usage(`unknown argument "${token}"`);
    }
  }
  if (!kind) usage('--kind is required');
  if (!url) usage('--url is required');
  return { kind, url, httpStatus, curlStatus, note };
}

function buildMessage(args: ReturnType<typeof parseArgs>): {
  subject: string;
  text: string;
  html: string;
} {
  const at = new Date().toISOString();
  const fields = [
    { label: 'URL', value: args.url },
    { label: 'HTTP', value: args.httpStatus },
    { label: 'curl', value: args.curlStatus },
    { label: 'Horodatage UTC', value: at },
  ];
  if (args.note) fields.push({ label: 'Détail', value: args.note });

  if (args.kind === 'website_down') {
    const subject = 'Shop: API inaccessible (/healthz)';
    const text = [
      "L'API Shop semble inaccessible.",
      '',
      `URL : ${args.url}`,
      `HTTP : ${args.httpStatus}`,
      `curl : ${args.curlStatus}`,
      `Horodatage UTC : ${at}`,
      ...(args.note ? [`Détail : ${args.note}`] : []),
      '',
      'Le cron keep-warm va tenter une procédure de restauration Passenger.',
    ].join('\n');
    return {
      subject,
      text,
      html: renderEmailTemplate('spyNotice', 'fr', {
        title: 'API inaccessible',
        fields,
        lines: ['Le cron keep-warm va tenter une procédure de restauration Passenger.'],
        footer: SPY_FOOTER,
      }),
    };
  }

  const subject = 'Shop: échec de restauration de l’API';
  const text = [
    "La procédure de restauration Passenger n'a pas rétabli /healthz.",
    '',
    `URL : ${args.url}`,
    `HTTP : ${args.httpStatus}`,
    `curl : ${args.curlStatus}`,
    `Horodatage UTC : ${at}`,
    ...(args.note ? [`Détail : ${args.note}`] : []),
    '',
    'Les prochaines exécutions du cron continueront à sonder sans renvoyer ces alertes tant que le service reste en panne.',
  ].join('\n');
  return {
    subject,
    text,
    html: renderEmailTemplate('spyNotice', 'fr', {
      title: 'Échec de restauration',
      fields,
      lines: [
        'Les prochaines exécutions du cron continueront à sonder sans renvoyer ces alertes tant que le service reste en panne.',
      ],
      footer: SPY_FOOTER,
    }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (config.disableSpyEmail) {
    console.log('[warm-outage-spy] skipped: DISABLE_SPY_EMAIL=true');
    return;
  }
  const to = await liveOrCachedOutageSpyTo(args.kind);
  if (!to) {
    console.log('[warm-outage-spy] skipped: no spy recipients (plugin empty or no cache)');
    return;
  }
  if (!config.smtp.host || !config.smtp.fromEmail) {
    throw new Error('SMTP is not configured (SMTP_HOST / EMAIL_NO_REPLY_FROM).');
  }

  const message = buildMessage(args);
  const subject = config.smtp.fromNamePrefix
    ? `${config.smtp.fromNamePrefix} ${message.subject}`
    : message.subject;
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
  });
  await transporter.sendMail({
    from: config.smtp.fromEmail,
    to,
    subject,
    text: message.text,
    html: message.html,
  });
  console.log(`[warm-outage-spy] sent kind=${args.kind} to=${to}`);
}

main().catch((error) => {
  console.error('[warm-outage-spy] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
