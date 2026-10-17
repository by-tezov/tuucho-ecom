/**
 * Browser-only Vite import used by the guest-vault functional test. The
 * module executes in the front application, not in Node's test process; this
 * declaration gives the test compiler its public test surface without making
 * it compile the entire sibling front-end project.
 */
declare module '*guestCardVault' {
  export function saveGuestCards(value: unknown): Promise<void>;
  export function saveGuestAddressState(value: unknown): Promise<void>;
  export function loadGuestCards(): Promise<{
    paymentMethods: unknown[];
    defaultPaymentMethod: unknown | null;
  }>;
  export function loadGuestAddressState(): Promise<{ addresses: unknown[] }>;
}
