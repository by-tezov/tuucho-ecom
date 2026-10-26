/** Profile social rows follow enabled sign-in openings, not plugin titles. */
export function signInOpeningOn(entries: { id: string }[] | undefined, id: string): boolean {
  return Boolean(entries?.some((entry) => entry.id === id));
}

export function signInProviderVisible(pluginOn: boolean, linked: boolean): boolean {
  return pluginOn || linked;
}

/** Link/unlink is offered only when the plugin is on, the shop flag is on,
 * and OAuth credentials exist. Missing Configure still shows the row. */
export function signInProviderOffered(
  pluginOn: boolean,
  preferenceOn: boolean,
  configured: boolean,
): boolean {
  return pluginOn && preferenceOn && configured;
}

/** The whole social block renders when the sign-in opening is on for at
 * least one provider, or the shop has OAuth credentials configured for one,
 * or the customer already linked one — even when no per-row
 * signInProviderVisible passes yet (rows keep their own rule above). */
export function signInBlockVisible(
  openings: { id: string }[] | undefined,
  providers: { configured: boolean; linked: boolean }[],
): boolean {
  return (openings?.length ?? 0) > 0 || providers.some((provider) => provider.configured || provider.linked);
}
