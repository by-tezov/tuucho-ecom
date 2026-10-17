/** Customer-facing checkout copy stays generic in production. Dev and
 * preprod may surface the provider/API detail for diagnosis. */
export function checkoutFacingError(generic: string, detail?: string | null): string {
  const trimmed = detail?.trim();
  if (!trimmed || __APP_TARGET__ === 'prod') return generic;
  return trimmed;
}
