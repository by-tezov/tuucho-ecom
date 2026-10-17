import { hostname, userInfo } from 'node:os';

/** Attribution headers for `/operation/*`. Not authentication. */
export function opsAttributionHeaders(mode?: string): Record<string, string> {
  const operatorUser =
    process.env.PAM_OPERATOR_USER?.trim() ||
    (() => {
      try {
        return userInfo().username;
      } catch {
        return process.env.USER || process.env.LOGNAME || 'operator';
      }
    })();
  const operatorHost = process.env.PAM_OPERATOR_HOST?.trim() || hostname();
  const resolvedMode = (process.env.PAM_OPS_MODE?.trim() || mode || '').trim();
  const sourceCommand =
    process.env.PAM_SOURCE_COMMAND?.trim() ||
    ['npm', 'run', ...process.argv.slice(1).map((arg) => arg.replace(/^.*\//, ''))].join(' ');

  return {
    'x-pam-operator-user': operatorUser.slice(0, 200),
    'x-pam-operator-host': operatorHost.slice(0, 200),
    ...(resolvedMode ? { 'x-pam-mode': resolvedMode.slice(0, 32) } : {}),
    'x-pam-source-command': sourceCommand.slice(0, 500),
  };
}

export function opsRequestHeaders(
  opsToken: string,
  mode?: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    authorization: `Bearer ${opsToken}`,
    ...opsAttributionHeaders(mode),
    ...extra,
  };
}
