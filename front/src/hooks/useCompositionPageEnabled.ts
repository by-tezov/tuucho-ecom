/** Composition is not shipped. Callers that still read the old Boutique
 * switch must treat it as closed. */
export function useCompositionPageEnabled(): boolean | null {
  return false;
}
