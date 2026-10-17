import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  isActivityCategory,
  isActivityOrigin,
  isActivityOutcome,
  type ActivityCategory,
  type ActivityOrigin,
  type ActivityOutcome,
} from '../domain/catalogue.js';
import { boundTargets, redactAndCapDetail, sanitizeSourceCommand } from '../domain/redaction.js';
import { activityLogPath, appendActivityLogLine } from '../infrastructure/activityLogFile.js';
import {
  currentOperatorAttribution,
  formatOperatorLabel,
} from './operatorContext.js';

export type RecordActivityInput = {
  category: ActivityCategory;
  action: string;
  summary: string;
  outcome?: ActivityOutcome;
  origin: ActivityOrigin;
  /** Required when origin is admin. */
  actorUserId?: string | null;
  actorEmail?: string | null;
  /** Required when origin is system (job name). Optional override otherwise. */
  actorLabel?: string | null;
  operatorUser?: string | null;
  operatorHost?: string | null;
  mode?: string | null;
  sourceCommand?: string | null | readonly string[];
  targetType?: string | null;
  targetId?: string | null;
  targets?: readonly string[] | null;
  detail?: unknown;
};

export class ActivityRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityRecordError';
  }
}

function resolveActor(input: RecordActivityInput): {
  actorUserId: string | null;
  actorEmail: string | null;
  actorLabel: string;
  operatorUser: string | null;
  operatorHost: string | null;
  mode: string | null;
  sourceCommand: string | null;
} {
  if (!isActivityCategory(input.category)) {
    throw new ActivityRecordError('invalid_category');
  }
  if (!isActivityOrigin(input.origin)) {
    throw new ActivityRecordError('invalid_origin');
  }
  const outcome = input.outcome ?? 'success';
  if (!isActivityOutcome(outcome)) {
    throw new ActivityRecordError('invalid_outcome');
  }
  if (!input.action?.trim()) throw new ActivityRecordError('invalid_action');
  if (!input.summary?.trim()) throw new ActivityRecordError('invalid_summary');

  if (input.origin === 'admin') {
    const actorUserId = input.actorUserId?.trim() || null;
    if (!actorUserId) throw new ActivityRecordError('admin_actor_required');
    const actorEmail = input.actorEmail?.trim() || null;
    return {
      actorUserId,
      actorEmail,
      actorLabel: input.actorLabel?.trim() || actorEmail || actorUserId,
      operatorUser: null,
      operatorHost: null,
      mode: null,
      sourceCommand: null,
    };
  }

  if (input.origin === 'system') {
    const actorLabel = input.actorLabel?.trim();
    if (!actorLabel) throw new ActivityRecordError('system_actor_required');
    return {
      actorUserId: null,
      actorEmail: null,
      actorLabel,
      operatorUser: null,
      operatorHost: null,
      mode: null,
      sourceCommand: null,
    };
  }

  const fromContext = currentOperatorAttribution();
  const operatorUser = input.operatorUser?.trim() || fromContext?.operatorUser || null;
  const operatorHost = input.operatorHost?.trim() || fromContext?.operatorHost || null;
  const mode = input.mode?.trim() || fromContext?.mode || null;
  const sourceCommand = sanitizeSourceCommand(
    input.sourceCommand ?? fromContext?.sourceCommand ?? null,
  );
  const attribution = { operatorUser, operatorHost, mode, sourceCommand };
  return {
    actorUserId: null,
    actorEmail: null,
    actorLabel: input.actorLabel?.trim() || formatOperatorLabel(attribution),
    operatorUser,
    operatorHost,
    mode,
    sourceCommand,
  };
}

export type ActivityLogRecord = {
  at: string;
  id: string;
  occurredAt: string;
  category: ActivityCategory;
  action: string;
  outcome: ActivityOutcome;
  origin: ActivityOrigin;
  actorUserId: string | null;
  actorEmail: string | null;
  actorLabel: string;
  operatorUser: string | null;
  operatorHost: string | null;
  mode: string | null;
  sourceCommand: string | null;
  targetType: string | null;
  targetId: string | null;
  targets: string[];
  summary: string;
  detail: Record<string, unknown>;
};

/** Journal line before it is appended. Validation runs here, with no file write. */
export function activityLogRecord(input: RecordActivityInput, now = new Date()): ActivityLogRecord {
  const actor = resolveActor(input);
  const { targets, targetsTruncated } = boundTargets(input.targets);
  const detailBase = redactAndCapDetail(input.detail ?? {});
  const detail =
    targetsTruncated && !('targetsTruncated' in detailBase)
      ? { ...detailBase, targetsTruncated: true }
      : detailBase;

  const id = randomUUID();
  const occurredAt = now.toISOString();
  return {
    at: occurredAt,
    id,
    occurredAt,
    category: input.category,
    action: input.action.trim(),
    outcome: input.outcome ?? 'success',
    origin: input.origin,
    actorUserId: actor.actorUserId,
    actorEmail: actor.actorEmail,
    actorLabel: actor.actorLabel,
    operatorUser: actor.operatorUser,
    operatorHost: actor.operatorHost,
    mode: actor.mode,
    sourceCommand: actor.sourceCommand,
    targetType: input.targetType?.trim() || null,
    targetId: input.targetId?.trim() || null,
    targets,
    summary: input.summary.trim().slice(0, 500),
    detail,
  };
}

/** Append one journal line to the private activity file. The database
 * argument is kept so callers that still pass their transaction client do
 * not change. The line is not part of that transaction. */
export async function recordActivity(
  _db: pg.Pool | pg.PoolClient,
  input: RecordActivityInput,
): Promise<string> {
  const record = activityLogRecord(input);
  await appendActivityLogLine(activityLogPath(), JSON.stringify(record));
  return record.id;
}

/** Best-effort journal write after a committed change. Logs and swallows
 * write failures so an import or deploy is never undone by the journal. */
export async function recordActivityBestEffort(
  db: pg.Pool | pg.PoolClient,
  input: RecordActivityInput,
): Promise<{ id: string | null; error: string | null }> {
  try {
    const id = await recordActivity(db, input);
    return { id, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[activity] journal write failed: ${message}`);
    return { id: null, error: message };
  }
}
