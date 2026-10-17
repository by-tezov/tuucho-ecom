import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';
import { config } from '@kernel/back/config/env';

export type ChatSseEventType = 'message' | 'session_closed' | 'session_reopened';

export interface ChatSseEvent {
  type: ChatSseEventType;
  sessionId: string;
  messageId: number;
}

type Subscriber = (event: ChatSseEvent) => void;

/** Who is holding the stream open. Both sides subscribe on the same session id,
 * so a bare count cannot tell "the customer is still there" from "the operator
 * has the panel open", and whoever asked would always get yes. */
export type ChatSseAudience = 'visitor' | 'operator';

const subscribers = new Map<string, Map<Subscriber, ChatSseAudience>>();
const activeReaders = new Map<string, Map<string, number>>();
let listenClient: pg.Client | undefined;
let starting: Promise<void> | undefined;

const CHANNEL = 'chat_message';

/** Identifies this process's own NOTIFY payloads. notifyChatMessage fans out
 * in-process *and* issues pg_notify, so that a multi-node deployment reaches
 * every node. On a single node — which is what this actually deploys as — the
 * NOTIFY came straight back to this same process's listen client, which
 * fanned the event out a second time: every subscriber received two SSE
 * frames per message, and the front reloads the session on each frame without
 * deduplicating, so one message cost two full refetches per connected client.
 * Skipping our own echo keeps both delivery routes exactly as they were and
 * simply stops them overlapping. */
const ORIGIN_ID = randomUUID();

export function subscribeChatSession(
  sessionId: string,
  subscriber: Subscriber,
  audience: ChatSseAudience,
): () => void {
  // Started here rather than when a router module is imported: importing the
  // app must not open a database connection (see app.ts). A LISTEN client is
  // only useful once something is actually subscribed, and ensureListener is
  // idempotent, so first subscription is the right moment.
  startChatSseListener();
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Map();
    subscribers.set(sessionId, set);
  }
  set.set(subscriber, audience);
  return () => {
    set!.delete(subscriber);
    if (set!.size === 0) subscribers.delete(sessionId);
  };
}

/** True while a browser SSE client is listening; pass an audience for one side.
 *
 * In-process and immediate: it answers "is someone there right now", never who
 * was. A tab closed a second ago already reads absent, and on a multi-node
 * deployment this would describe one node (see ORIGIN_ID above). */
export function hasChatSessionSubscribers(sessionId: string, audience?: ChatSseAudience): boolean {
  const set = subscribers.get(sessionId);
  if (!set) return false;
  if (audience === undefined) return set.size > 0;
  for (const value of set.values()) if (value === audience) return true;
  return false;
}

/** Presence is deliberately ephemeral; durable read state lives in PostgreSQL. */
export function setChatActiveReader(sessionId: string, userId: string, active: boolean): void {
  const readers = activeReaders.get(sessionId) ?? new Map<string, number>();
  if (active) {
    readers.set(userId, Date.now() + 45_000);
    activeReaders.set(sessionId, readers);
  } else {
    readers.delete(userId);
    if (readers.size === 0) activeReaders.delete(sessionId);
  }
}

export function hasChatActiveReader(sessionId: string): boolean {
  const readers = activeReaders.get(sessionId);
  if (!readers) return false;
  const now = Date.now();
  for (const [userId, expiresAt] of readers) if (expiresAt <= now) readers.delete(userId);
  if (readers.size === 0) {
    activeReaders.delete(sessionId);
    return false;
  }
  return true;
}

function fanOut(event: ChatSseEvent): void {
  const set = subscribers.get(event.sessionId);
  if (!set) return;
  // `set` is a Map keyed by the subscriber, so iterate its keys: iterating the
  // Map itself would hand each entry as a [subscriber, audience] pair.
  for (const subscriber of set.keys()) {
    try {
      subscriber(event);
    } catch (error) {
      console.error('[chat sse] subscriber error', error);
    }
  }
}

export async function notifyChatMessage(
  db: Pool | PoolClient,
  sessionId: string,
  messageId: number,
  type: ChatSseEventType = 'message',
): Promise<void> {
  const payload = JSON.stringify({ type, sessionId, messageId, origin: ORIGIN_ID });
  // Local in-process fan-out first so a single-node API never depends on
  // LISTEN being ready for the writer connection's own NOTIFY. `origin` is
  // what stops that same NOTIFY being fanned out again when it returns here
  // (see ORIGIN_ID); other nodes have a different id and still deliver it.
  fanOut({ type, sessionId, messageId });
  await db.query(`select pg_notify($1, $2)`, [CHANNEL, payload]);
}

async function ensureListener(): Promise<void> {
  if (listenClient) return;
  if (starting) {
    await starting;
    return;
  }
  starting = (async () => {
    const client = new pg.Client({ connectionString: config.databaseUrl });
    client.on('error', (error) => {
      console.error('[chat sse] listen client error', error);
      listenClient = undefined;
      starting = undefined;
    });
    client.on('notification', (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const parsed = JSON.parse(msg.payload) as ChatSseEvent & { origin?: string };
        if (!parsed.sessionId) return;
        // Our own NOTIFY echoing back: notifyChatMessage already delivered it
        // in-process before issuing this. Anything from another node (or an
        // older build with no `origin`) still fans out normally.
        if (parsed.origin === ORIGIN_ID) return;
        fanOut({ type: parsed.type, sessionId: parsed.sessionId, messageId: parsed.messageId });
      } catch (error) {
        console.error('[chat sse] bad notify payload', error);
      }
    });
    await client.connect();
    await client.query(`listen ${CHANNEL}`);
    listenClient = client;
  })();
  try {
    await starting;
  } finally {
    starting = undefined;
  }
}

/** Start the dedicated LISTEN client (safe to call more than once). */
function startChatSseListener(): void {
  void ensureListener().catch((error) => {
    console.error('[chat sse] failed to start listener', error);
  });
}
