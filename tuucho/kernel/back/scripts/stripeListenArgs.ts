/**
 * Classic webhook objects (`event.data.object`). Current Stripe CLI builds
 * refuse `stripe listen` unless the event set is named. Thin events are a
 * different payload and are not what this API verifies.
 */
export function stripeListenArgs(forwardTo: string): string[] {
  return ['listen', '--all-snapshot', '--forward-to', forwardTo];
}

/** A shop secret the API and the local CLI can charge with. Placeholders do not count. */
export function isUsableStripeSecretKey(value: unknown): boolean {
  return typeof value === 'string' && /^sk_(?:test|live)_[A-Za-z0-9]+$/.test(value.trim());
}

/** Strip signing secrets and API keys before a CLI failure is printed. */
export function redactStripeCliOutput(text: string): string {
  return text
    .replace(/whsec_[A-Za-z0-9]+/g, 'whsec_[redacted]')
    .replace(/\b[sr]k_(?:live|test)_[A-Za-z0-9]+/g, '[redacted key]');
}
