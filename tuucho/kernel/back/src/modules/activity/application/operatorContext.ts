import { AsyncLocalStorage } from 'node:async_hooks';

export type OperatorAttribution = {
  operatorUser: string | null;
  operatorHost: string | null;
  mode: string | null;
  sourceCommand: string | null;
};

const storage = new AsyncLocalStorage<OperatorAttribution>();

export function runWithOperatorAttribution<T>(attribution: OperatorAttribution, fn: () => T): T {
  return storage.run(attribution, fn);
}

export function currentOperatorAttribution(): OperatorAttribution | null {
  return storage.getStore() ?? null;
}

export function formatOperatorLabel(attribution: OperatorAttribution): string {
  const user = attribution.operatorUser?.trim() || 'opérateur';
  const host = attribution.operatorHost?.trim();
  const mode = attribution.mode?.trim();
  const parts = [user];
  if (host) parts.push(`@${host}`);
  if (mode) parts.push(`(${mode})`);
  return parts.join('');
}
