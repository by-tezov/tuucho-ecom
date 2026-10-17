/** One-shot migrate of a sessionStorage value from an old key to `psn-*`. */
export function takeSessionKey(newKey: string, oldKey: string): string | null {
  try {
    const next = sessionStorage.getItem(newKey);
    if (next != null) return next;
    const prev = sessionStorage.getItem(oldKey);
    if (prev == null) return null;
    sessionStorage.setItem(newKey, prev);
    sessionStorage.removeItem(oldKey);
    return prev;
  } catch {
    return null;
  }
}

/** One-shot migrate of a localStorage value from an old key to `psn-*`. */
export function takeLocalKey(newKey: string, oldKey: string): string | null {
  try {
    const next = localStorage.getItem(newKey);
    if (next != null) return next;
    const prev = localStorage.getItem(oldKey);
    if (prev == null) return null;
    localStorage.setItem(newKey, prev);
    localStorage.removeItem(oldKey);
    return prev;
  } catch {
    return null;
  }
}
