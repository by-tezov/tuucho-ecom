/** Contact live-chat ops CLI.
 *
 *   npm run chat -- --dev|--preprod|--prod          # pick an open session (↑↓ + Enter)
 *   npm run chat -- reopen <SESSION_ID> [--confirm] --dev
 *   npm run chat -- notifications process [--confirm] --dev
 *   npm run chat -- sessions [--status open|closed|all] --dev
 *   npm run chat -- <SESSION_ID> --dev             # interactive owner chat
 *
 * --confirm is required on reopen/notifications only when targeting --prod
 * — never for --dev/--preprod. talk/sessions/the bare pick form never need
 * it (talk is a live human-supervised REPL, not a scripted mutation;
 * sessions is read-only).
 *
 * Interactive mode prints the transcript, lets you type replies, and polls
 * for new visitor messages until you type /quit (closes the session) or the visitor closes.
 *
 * Email replies use operation/tuucho-chat-inbound.sh → POST /operation/chat/inbound
 * (not this CLI).
 */
import { Command as Program } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addTargetOptionFlags,
  makeFail,
  requireConfirmForProdWrite,
  resolveModeFromOpts,
  type TargetOpts,
} from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_ID_RE = /^[A-Fa-f0-9]{8}$/;

type Command = 'sessions' | 'talk' | 'pick' | 'reopen' | 'notifications';

interface Args {
  command: Command;
  sessionId?: string;
  mode: Mode;
  status?: string;
  json: boolean;
}

interface PublicMessage {
  id: number;
  sender: 'user' | 'owner';
  body: string;
  createdAt: string;
  attachments?: { fileName: string; absolutePath?: string }[];
}

/** Exactly what `GET /operation/chat/sessions` returns. Keep it exact: this
 * type used to claim three fields the endpoint never sent, so the orphan
 * tagging below read `undefined` every time and could never fire. */
interface SessionSummary {
  publicId: string;
  status: string;
  visitorEmail: string;
  visitorIdentity: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  closedAt: string | null;
  messageCount: number;
  /** The customer has the chat panel open right now. */
  visitorLive: boolean;
}

/** An open session nobody is watching from the customer's side: the tab is
 * closed or the session is lost, so a reply will not be read until they come
 * back. Derived rather than served, because it is only these two facts. */
function isOrphan(session: SessionSummary): boolean {
  return session.status === 'open' && !session.visitorLive;
}

const program = new Program();
program.name('chat').description('Contact live-chat ops CLI.');
const fail: (message: string) => never = makeFail(program, 'chat');

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

interface RootOpts extends TargetOpts {
  json?: boolean;
  confirm?: boolean;
}

/** Every documented usage puts target flags (and --json) *after*
 * the subcommand name (`chat reopen <id> --dev`) — but a *mandatory*
 * option, or even just a same-named option redeclared on a subcommand,
 * conflicts with a parent option of the same name and breaks that ordering
 * (commander then requires it before the subcommand word). So target/--json
 * are declared exactly once, on the root, not mandatory there;
 * every subcommand reads them back merged via optsWithGlobals() and this
 * helper checks exactly one target was given, wherever it appeared. */
function rootOpts(command: Program): Required<Pick<RootOpts, 'mode'>> & RootOpts {
  const opts = command.optsWithGlobals<RootOpts>();
  try {
    opts.mode = resolveModeFromOpts(opts);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  return opts as Required<Pick<RootOpts, 'mode'>> & RootOpts;
}

addTargetOptionFlags(program)
  .option('--json', 'print one JSON object to stdout instead of the human-readable output')
  .option('--confirm', 'required for reopen/notifications when targeting --prod (never for --dev/--preprod)')
  .argument(
    '[sessionId]',
    'interactive owner chat with this session (e.g. CCC13F56); omit to pick from open sessions',
  )
  .action((sessionId: string | undefined, _opts: RootOpts, command: Program) =>
    runAction(async () => {
      const opts = rootOpts(command);
      if (sessionId === undefined) {
        await runMain({ command: 'pick', mode: opts.mode, json: Boolean(opts.json) });
        return;
      }
      if (!SESSION_ID_RE.test(sessionId)) fail(`Unknown command ${sessionId}`);
      await runMain({
        command: 'talk',
        sessionId: sessionId.toUpperCase(),
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${opsToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function formatMessage(message: PublicMessage, visitorRole: 'guest' | 'user' | 'user-unverified'): string {
  const head = message.sender === 'owner' ? `> ${message.body}` : `${visitorRole}> ${message.body}`;
  const files = message.attachments ?? [];
  if (files.length === 0) return head;
  const lines = files.map((item) => {
    if (item.absolutePath) {
      return `  [fichier] ${item.fileName} — ${item.absolutePath}`;
    }
    return `  [fichier] ${item.fileName}`;
  });
  return [head, ...lines].join('\n');
}

function formatSessionWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSessionChoice(session: SessionSummary): string {
  const who = session.visitorIdentity?.trim() || '—';
  const when = session.messageCount === 0 ? 'aucun message' : formatSessionWhen(session.lastMessageAt);
  const tag = session.visitorLive ? 'live' : isOrphan(session) ? '\x1b[31morphan\x1b[0m' : session.status;
  return `${session.publicId}  ${who}  <${session.visitorEmail}>  ${when}  [${tag}]`;
}

/** Arrow-key menu. Returns the selected value, or null on cancel / Ctrl+C. */
async function selectWithArrows(choices: Array<{ label: string; value: string }>): Promise<string | null> {
  if (choices.length === 0) return null;

  if (!input.isTTY || !output.isTTY) {
    for (let i = 0; i < choices.length; i += 1) {
      console.log(`  ${i + 1}. ${choices[i]!.label}`);
    }
    const rl = createInterface({ input, output, terminal: false });
    try {
      const answer = (await rl.question('Numéro (Entrée pour annuler) : ')).trim();
      if (!answer) return null;
      const index = Number(answer) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
        console.error('Choix invalide.');
        return null;
      }
      return choices[index]!.value;
    } finally {
      rl.close();
    }
  }

  let index = 0;
  let firstDraw = true;

  const draw = () => {
    if (!firstDraw) output.write(`\x1b[${choices.length}A`);
    firstDraw = false;
    for (let i = 0; i < choices.length; i += 1) {
      output.write('\x1b[2K');
      const mark = i === index ? '>' : ' ';
      output.write(`${mark} ${choices[i]!.label}\n`);
    }
  };

  output.write('Sessions ouvertes — ↑↓ puis Entrée (q pour annuler)\n');
  output.write('\x1b[?25l');
  draw();

  return new Promise((resolve) => {
    const finish = (value: string | null) => {
      input.off('data', onData);
      if (input.isTTY && input.setRawMode) input.setRawMode(false);
      output.write('\x1b[?25h');
      resolve(value);
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString('utf8');
      if (key === '\u0003') {
        finish(null);
        process.exit(130);
      }
      if (key === 'q' || key === 'Q' || key === '\u001b') {
        finish(null);
        return;
      }
      if (key === '\r' || key === '\n') {
        finish(choices[index]!.value);
        return;
      }
      if (key === '\u001b[A' || key === '\u001bOA') {
        index = (index - 1 + choices.length) % choices.length;
        draw();
        return;
      }
      if (key === '\u001b[B' || key === '\u001bOB') {
        index = (index + 1) % choices.length;
        draw();
      }
    };

    if (input.isTTY && input.setRawMode) input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function fetchOpenSessions(apiBaseUrl: string, opsToken: string): Promise<SessionSummary[]> {
  const { status, json } = await apiFetch(
    apiBaseUrl,
    opsToken,
    'GET',
    '/operation/chat/sessions?status=open',
  );
  if (status !== 200) {
    console.error(json);
    process.exit(1);
  }
  const sessions = (json as { data: { sessions: SessionSummary[] } }).data.sessions;
  return sessions;
}

async function pickOpenSession(apiBaseUrl: string, opsToken: string): Promise<string | null> {
  const sessions = await fetchOpenSessions(apiBaseUrl, opsToken);
  if (sessions.length === 0) {
    log(false, 'Aucune session ouverte.');
    return null;
  }
  const orphanCount = sessions.filter(isOrphan).length;
  if (orphanCount > 0) {
    log(
      false,
      `${orphanCount} orphan (visiteur plus connecté : onglet fermé ou session perdue). [live] = panneau chat ouvert.`,
    );
  }
  return selectWithArrows(
    sessions.map((session) => ({
      label: formatSessionChoice(session),
      value: session.publicId,
    })),
  ).then((value) => {
    if (!value) log(false, 'Annulé.');
    return value;
  });
}

async function runInteractiveTalk(apiBaseUrl: string, opsToken: string, sessionId: string): Promise<void> {
  const load = async () => {
    const { status, json } = await apiFetch(
      apiBaseUrl,
      opsToken,
      'GET',
      `/operation/chat/sessions/${sessionId}`,
    );
    if (status !== 200) {
      console.error(json);
      process.exit(1);
    }
    const data = json as {
      data: {
        connected: boolean;
        emailVerified: boolean;
        session: {
          publicId: string;
          status: string;
          visitorEmail: string;
          visitorIdentity: string | null;
          messages: PublicMessage[];
        };
      };
    };
    const visitorRole = data.data.connected
      ? data.data.emailVerified
        ? 'user'
        : 'user-unverified'
      : 'guest';
    return { session: data.data.session, visitorRole };
  };

  let { session, visitorRole } = await load();

  console.log('');
  console.log('Commandes : /quit  /refresh');
  console.log('Les nouveaux messages s’affichent automatiquement.');
  console.log('----------------------------------------');
  console.log(
    `Chat #${session.publicId} — ${visitorRole} : ${session.visitorIdentity ?? '—'} <${session.visitorEmail}>`,
  );
  console.log(`Statut : ${session.status}`);
  console.log('----------------------------------------');
  for (const message of session.messages) {
    console.log(formatMessage(message, visitorRole));
  }
  if (session.status === 'closed')
    console.log('Session fermée côté client — Shop peut encore répondre ou la rouvrir.');
  console.log('----------------------------------------');

  let lastId = session.messages.at(-1)?.id ?? 0;
  const rl = createInterface({ input, output, terminal: true });

  const poll = setInterval(() => {
    void (async () => {
      try {
        const next = await load();
        const fresh = next.session.messages.filter((m) => m.id > lastId);
        for (const message of fresh) {
          lastId = Math.max(lastId, message.id);
          // Don't echo our own replies — we already typed them at the prompt.
          if (message.sender === 'owner') continue;
          console.log('');
          console.log(formatMessage(message, next.visitorRole));
        }
        if (session.status === 'open' && next.session.status === 'closed')
          console.log('\n[session fermée par le visiteur — vous pouvez encore répondre]');
        session = next.session;
        visitorRole = next.visitorRole;
      } catch {
        // keep the REPL alive on transient poll errors
      }
    })();
  }, 2000);

  try {
    while (true) {
      const line = await rl.question('> ');
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === '/quit' || trimmed === '/exit' || trimmed === '/q') {
        if (session.status === 'open') {
          const { status, json } = await apiFetch(
            apiBaseUrl,
            opsToken,
            'POST',
            `/operation/chat/sessions/${sessionId}/close`,
          );
          if (status !== 200) {
            console.error('Fermeture échouée:', json);
            continue;
          }
          console.log('Session fermée.');
        }
        break;
      }
      if (trimmed === '/refresh') {
        const next = await load();
        session = next.session;
        console.log('--- transcript ---');
        for (const message of session.messages) console.log(formatMessage(message, visitorRole));
        lastId = session.messages.at(-1)?.id ?? lastId;
        continue;
      }
      const { status, json } = await apiFetch(
        apiBaseUrl,
        opsToken,
        'POST',
        `/operation/chat/sessions/${sessionId}/messages`,
        { body: trimmed },
      );
      if (status !== 201) {
        console.error('Envoi échoué:', json);
        const next = await load();
        session = next.session;
        visitorRole = next.visitorRole;
        continue;
      }
      const message = (json as { data: { message: PublicMessage } }).data.message;
      // Advance cursor so the poll does not re-print our own reply.
      lastId = Math.max(lastId, message.id);
    }
  } finally {
    clearInterval(poll);
    rl.close();
  }
}

async function runMain(args: Args): Promise<void> {
  const mode = args.mode;
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  const opsToken = loadOpsToken(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${mode}`);

  if (args.command === 'pick') {
    const sessionId = await pickOpenSession(apiBaseUrl, opsToken);
    if (!sessionId) process.exit(0);
    await runInteractiveTalk(apiBaseUrl, opsToken, sessionId);
    return;
  }

  if (args.command === 'reopen') {
    if (!args.sessionId) fail('reopen needs a session id');
    const { status, json } = await apiFetch(
      apiBaseUrl,
      opsToken,
      'POST',
      `/operation/chat/sessions/${args.sessionId}/reopen`,
    );
    log(
      status >= 200 && status < 300,
      status >= 200 && status < 300 ? 'Session reopened.' : `HTTP ${status}`,
    );
    if (json) printJson(json);
    process.exit(status >= 200 && status < 300 ? 0 : 1);
  }

  if (args.command === 'notifications') {
    const { status, json } = await apiFetch(
      apiBaseUrl,
      opsToken,
      'POST',
      '/operation/chat/notifications/process',
    );
    if (status !== 200) {
      console.error(json);
      process.exit(1);
    }
    if (args.json) printJson(json);
    else log(false, 'Chat notification outbox processed.');
    return;
  }

  if (args.command === 'talk') {
    if (!args.sessionId) fail('Session id required');
    await runInteractiveTalk(apiBaseUrl, opsToken, args.sessionId);
    return;
  }

  if (args.command === 'sessions') {
    const status = args.status ?? 'open';
    const { status: httpStatus, json } = await apiFetch(
      apiBaseUrl,
      opsToken,
      'GET',
      `/operation/chat/sessions?status=${encodeURIComponent(status)}`,
    );
    if (httpStatus !== 200) {
      console.error(json);
      process.exit(1);
    }
    if (args.json) printJson(json);
    else {
      const sessions = (json as { data: { sessions: SessionSummary[] } }).data.sessions;
      if (sessions.length === 0) log(false, '(aucune session)');
      else {
        logTable(
          false,
          sessions.map((s) => ({
            id: s.publicId,
            status: s.status,
            tag: '',
            messages: String(s.messageCount ?? ''),
            email: s.visitorEmail,
            identity: s.visitorIdentity ?? '',
            lastMessageAt: s.lastMessageAt ?? '',
          })),
        );
        log(false, `\nOuvrir une session : npm run chat -- <id> --${mode}`);
      }
    }
    return;
  }
}

// No --confirm gate here (or on the bare `chat <sessionId>` / pick form
// above) — this is a live, human-supervised REPL where every reply is typed
// and sent one at a time by the operator, not a scripted batch mutation.
// Requiring --confirm to even open the session would just be friction for
// something that's already fully supervised message-by-message.
program
  .command('talk')
  .description('Interactive owner chat with a session.')
  .argument('<sessionId>', 'e.g. CCC13F56')
  .action((sessionId: string, _opts: unknown, command: Program) =>
    runAction(async () => {
      const opts = rootOpts(command);
      if (!SESSION_ID_RE.test(sessionId)) fail(`Invalid session id "${sessionId}".`);
      await runMain({
        command: 'talk',
        sessionId: sessionId.toUpperCase(),
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

program
  .command('reopen')
  .description('Reopen a closed session.')
  .argument('<sessionId>', 'e.g. CCC13F56')
  .action((sessionId: string, _opts: unknown, command: Program) =>
    runAction(async () => {
      const opts = rootOpts(command);
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'reopen');
      if (!SESSION_ID_RE.test(sessionId)) fail(`Invalid session id "${sessionId}".`);
      await runMain({
        command: 'reopen',
        sessionId: sessionId.toUpperCase(),
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

program
  .command('notifications')
  .description('Process the chat notification outbox.')
  .argument('[action]', 'accepted for compatibility, e.g. "process" — ignored')
  .action((_action: string | undefined, _opts: unknown, command: Program) =>
    runAction(async () => {
      const opts = rootOpts(command);
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'notifications');
      await runMain({
        command: 'notifications',
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

program
  .command('sessions')
  .description('List sessions.')
  .option('--status <status>', 'open|closed|all', 'open')
  .action((localOpts: { status?: string }, command: Program) =>
    runAction(async () => {
      const opts = rootOpts(command);
      await runMain({
        command: 'sessions',
        status: localOpts.status,
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

program.parse();
