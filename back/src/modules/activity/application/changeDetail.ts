import {
  ACTIVITY_CHANGE_LABELS,
  buildChanges,
  summarizeChanges,
  type ActivityChange,
} from '../domain/changes.js';

export type { ActivityChange };

export function activityChangeDetail(
  context: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  labels: Record<string, string> = ACTIVITY_CHANGE_LABELS,
): { changes: ActivityChange[]; changeSummary: string; detail: Record<string, unknown> } {
  const changes = buildChanges(before, after);
  return {
    changes,
    changeSummary: summarizeChanges(changes, labels),
    detail: { ...context, changes },
  };
}
