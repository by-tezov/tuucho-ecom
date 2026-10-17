const PIN_PATTERN = /^\d{4}$/;

export function parseAccessPin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const pin = value.trim();
  if (!PIN_PATTERN.test(pin)) return null;
  return pin;
}

export function pinDigestInput(offerId: string, pin: string): string {
  return `${offerId}:pin:${pin}`;
}
