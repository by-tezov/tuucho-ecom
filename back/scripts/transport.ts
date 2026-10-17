export type Transport = 'ssh' | 'ftp';

/** Removes the transport selector from a command's tokens. Returns undefined
 * when none was given: `--dev` never leaves this machine, so requiring a
 * transport there would break every local invocation for nothing. Callers
 * targeting a remote mode enforce the flag themselves via
 * `requireTransport` once they know the mode. */
export function parseTransportFlags(tokens: string[]): { transport: Transport | undefined; rest: string[] } {
  const selected = [
    ...new Set(tokens.filter((token): token is `--${Transport}` => token === '--ssh' || token === '--ftp')),
  ];
  if (selected.length > 1) {
    throw new Error('--ssh and --ftp are mutually exclusive');
  }
  const flag = selected[0];
  return {
    transport: flag?.slice(2) as Transport | undefined,
    rest: flag ? tokens.filter((token) => token !== flag) : tokens,
  };
}

/** Remote targets must say how to reach the host. Keeping the check in one
 * place is what stops a nested npm command from silently falling back to SSH
 * when the operator asked for FTP. */
export function requireTransport(transport: Transport | undefined, mode: string): Transport {
  if (!transport) {
    throw new Error(`exactly one of --ssh or --ftp is required for --${mode}`);
  }
  return transport;
}

/** The flag to hand down to a nested npm command. `--dev` gets nothing, so
 * the nested command's own parser stays on the local path. */
export function transportFlags(transport: Transport | undefined): string[] {
  return transport ? [`--${transport}`] : [];
}
