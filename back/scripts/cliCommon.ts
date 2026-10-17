import type { Command } from 'commander';
import type { Mode } from './envFile.js';

/** Attach the shared `--confirm` flag to a command that writes data.
 * Pair with `requireConfirmForProdWrite` in the action. */
export function addConfirmOption(command: Command, description = 'required when targeting --prod'): Command {
  return command.option('--confirm', description);
}

/**
 * Policy: any command that writes to the target environment requires
 * `--confirm` only when `mode === 'prod'` — never for `--dev`/`--preprod`,
 * and never for read-only commands (which shouldn't call this at all).
 * `what` names the command for the error message, e.g. `` `database-reset` ``
 * or `` `library delete-all` ``.
 */
export function requireConfirmForProdWrite(
  mode: Mode,
  confirm: boolean | undefined,
  fail: (message: string) => never,
  what: string,
): void {
  if (mode === 'prod' && !confirm) fail(`${what} requires --confirm when targeting --prod.`);
}

const MODES: readonly Mode[] = ['dev', 'preprod', 'prod'];
export const DEPLOY_MODES: readonly Mode[] = ['preprod', 'prod'];

export type TargetOpts = {
  dev?: boolean;
  preprod?: boolean;
  prod?: boolean;
  /** Set by `applyResolvedMode` after exactly one target flag is selected. */
  mode?: Mode;
};

/** CLI flag for a resolved mode, e.g. `dev` → `--dev`. */
export function modeFlag(mode: Mode): `--${Mode}` {
  return `--${mode}`;
}

/**
 * Resolve exactly one of `--dev` / `--preprod` / `--prod`.
 * Throws an Error with a clear message when zero or multiple are set.
 */
export function resolveModeFromOpts(opts: TargetOpts, allowed: readonly Mode[] = MODES): Mode {
  const selected: Mode[] = [];
  if (opts.dev) selected.push('dev');
  if (opts.preprod) selected.push('preprod');
  if (opts.prod) selected.push('prod');

  const allowedSet = new Set(allowed);
  const valid = selected.filter((mode) => allowedSet.has(mode));
  const disallowed = selected.filter((mode) => !allowedSet.has(mode));

  if (disallowed.length > 0) {
    throw new Error(
      `unsupported target flag(s): ${disallowed.map((m) => `--${m}`).join(', ')} (allowed: ${allowed.map((m) => `--${m}`).join(', ')})`,
    );
  }
  if (valid.length === 0) {
    throw new Error(`exactly one of ${allowed.map((m) => `--${m}`).join(', ')} is required`);
  }
  if (valid.length > 1) {
    throw new Error(`only one target flag allowed; got ${valid.map((m) => `--${m}`).join(' and ')}`);
  }
  return valid[0]!;
}

/** Attach `--dev` / `--preprod` / `--prod` flags (no validation hook). */
export function addTargetOptionFlags(command: Command, allowed: readonly Mode[] = MODES): Command {
  if (allowed.includes('dev')) command.option('--dev', 'target development');
  if (allowed.includes('preprod')) command.option('--preprod', 'target preprod');
  if (allowed.includes('prod')) command.option('--prod', 'target production');
  return command;
}

/** Attach target flags and set `opts.mode` in preAction (exactly one required). */
export function addTargetOptions(command: Command, allowed: readonly Mode[] = MODES): Command {
  return addTargetOptionFlags(command, allowed).hook('preAction', (thisCommand) => {
    try {
      const mode = resolveModeFromOpts(thisCommand.opts() as TargetOpts, allowed);
      thisCommand.setOptionValue('mode', mode);
    } catch (error) {
      thisCommand.error(`[cli] ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/**
 * Adds `--dev` / `--preprod` / `--prod` (exactly one required) and `--json`.
 * Call once per Command that should accept them (root for flat scripts, or
 * each subcommand when flags follow the subcommand name).
 * After parse, `opts.mode` is set to the resolved Mode.
 */
export function addCommonOptions(command: Command): Command {
  return addTargetOptions(command, MODES).option(
    '--json',
    'print one JSON object to stdout instead of the human-readable output',
  );
}

/** Replaces this repo's duplicated `usageError()`/`fail()` helpers: prints
 * `[prefix] message` to stderr and exits 1, via commander's own error path
 * instead of a hand-rolled console.error + process.exit(1). */
export function makeFail(program: Command, prefix: string): (message: string) => never {
  return (message: string): never => program.error(`[${prefix}] ${message}`);
}

/**
 * Parse argv for hand-rolled CLIs: exactly one of the allowed target flags.
 * Rejects legacy `--mode` and unknown tokens that look like target selection.
 */
