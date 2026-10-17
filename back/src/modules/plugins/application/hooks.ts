import type { FilterFn, HookFn } from '../domain/contracts.js';

type Ranked<T> = { fn: T; priority: number };

const actions = new Map<string, Ranked<HookFn>[]>();
const filters = new Map<string, Ranked<FilterFn>[]>();

function insert<T>(list: Ranked<T>[], item: Ranked<T>): Ranked<T>[] {
  const next = [...list, item];
  next.sort((a, b) => a.priority - b.priority);
  return next;
}

export function addAction(name: string, fn: HookFn, priority = 10): void {
  actions.set(name, insert(actions.get(name) ?? [], { fn, priority }));
}

export function addFilter<T>(name: string, fn: FilterFn<T>, priority = 10): void {
  filters.set(name, insert(filters.get(name) ?? [], { fn: fn as FilterFn, priority }));
}

export async function doAction(name: string, ...args: unknown[]): Promise<void> {
  for (const { fn } of actions.get(name) ?? []) {
    await fn(...args);
  }
}

export async function applyFilters<T>(name: string, value: T, ...args: unknown[]): Promise<T> {
  let current = value;
  for (const { fn } of filters.get(name) ?? []) {
    current = (await fn(current, ...args)) as T;
  }
  return current;
}
