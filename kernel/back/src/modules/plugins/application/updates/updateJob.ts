import type { ApplyRequest } from './scopedPaths.js';
import { applyUpdates, type ApplyResult } from './applyUpdates.js';
import type { UpdateLogItem } from './log.js';
import { createGithubClient } from './githubClient.js';

export type UpdateJob = {
  id: string;
  status: 'running' | 'ok' | 'error';
  log: UpdateLogItem[];
  restartRequired: boolean;
  error?: string;
};

let current: UpdateJob | null = null;

export function getUpdateJob(): UpdateJob | null {
  return current;
}

export function startUpdateJob(request: ApplyRequest): UpdateJob {
  if (current?.status === 'running') {
    throw new Error('An update is already running.');
  }
  const job: UpdateJob = {
    id: `upd-${Date.now()}`,
    status: 'running',
    log: [],
    restartRequired: false,
  };
  current = job;
  void applyUpdates(request, createGithubClient(), (log) => {
    job.log = log;
  })
    .then((result: ApplyResult) => {
      job.log = result.log;
      job.restartRequired = result.restartRequired;
      job.status = result.ok ? 'ok' : 'error';
      job.error = result.error;
    })
    .catch((error: unknown) => {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : 'Apply failed.';
    });
  return job;
}
