/** PluginHost-free merge so tests and dictionary assembly can overlay
 * locale catalogs without loading every plugin React front. */
export function deepMerge<T>(base: T, overlay: unknown): T {
  if (overlay === undefined || overlay === null) return base;
  if (Array.isArray(overlay) || typeof overlay !== 'object') return overlay as T;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return overlay as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
    out[key] = deepMerge(out[key], value);
  }
  return out as T;
}
