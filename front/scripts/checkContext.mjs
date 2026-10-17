#!/usr/bin/env node
/**
 * The per-feature context budget, enforced from the side that now dominates it.
 *
 * The budget is computed in `../pamsurin-back/scripts/featureContext.mjs`,
 * because `docs/features.json` lives there and spans both repositories. But the
 * front is the larger half of 9 of the 15 features (payments is 5,255 front
 * lines against 1,132 back), so a front-side change was the one most likely to
 * blow a budget and the least likely to be measured before it did.
 *
 * This runs that same check with the backend as its working directory, so there
 * is one definition of the measure and no second copy to drift.
 *
 * Skipped when the sibling backend checkout is absent, so this repository still
 * builds standalone.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const backRoot = resolve('../pamsurin-back');
const script = resolve(backRoot, 'scripts/featureContext.mjs');

if (!existsSync(script)) {
  console.log('context check skipped: ../pamsurin-back is not available.');
  process.exit(0);
}

const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: backRoot,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
