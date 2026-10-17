/** A refresh keeps an open tab signed in every access-token lifetime; that is
 * not a sign-in. A refresh of a session idle at least `idleMs` (the site was
 * closed and reopened, or the device woke up) is an automatic sign-in and
 * gets the same alert as a real one. */
export function isIdleResume(previousIssuedAt: string, nowMs: number, idleMs: number): boolean {
  const issued = Date.parse(previousIssuedAt);
  return Number.isFinite(issued) && nowMs - issued >= idleMs;
}
