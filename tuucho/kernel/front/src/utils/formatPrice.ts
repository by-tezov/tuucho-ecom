/** Same cent rounding as kernel/back `checkoutMoney.roundMoney`. Preview
 * totals must use this before comparing to zero; raw float sums such as
 * 13 + 4.99 - 17.99 stay slightly above 0 while `toFixed(2)` still prints
 * 0.00. */
export function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

/** All prices are TTC, single currency (EUR) — no per-language currency
 * formatting needed, the shop only ever operates in euros regardless of UI
 * language (same "universal, not translated" treatment as e.g. sizes). */
export function formatPrice(price: number): string {
  return `${roundPrice(price).toFixed(2)} €`;
}
