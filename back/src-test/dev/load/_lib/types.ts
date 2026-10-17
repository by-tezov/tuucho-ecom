/** Shared catalogue + user types for load setup / scenarios. */
export interface CatalogPick {
  productId: string;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: 'XS' | 'S' | 'M' | 'L';
  courierCode: string;
}

export interface LoadUser {
  email: string;
  accessToken: string;
  addressId?: string;
  /** Dedicated load voucher so checkout VUs do not serialize on one promo row. */
  voucherCode?: string;
  /** Optional per-user catalogue line to spread stock-row locks. */
  catalog?: CatalogPick;
}

/** One offered single nail, the unit a composed set is built from. */
export interface NailPick {
  productId: string;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: 'XS' | 'S' | 'M' | 'L';
  /** Option of a nail with a variation axis; `''` for a plain nail. */
  variationKey: string;
}

export interface LoadSetupData {
  voucherCode: string;
  catalog: CatalogPick;
  /** Every in-stock set pick, for scenarios that spread across the catalogue. */
  catalogs: CatalogPick[];
  /** Empty when the catalogue has no single nails (compose VUs then skip). */
  nails: NailPick[];
  authUsers: LoadUser[];
  checkoutUsers: LoadUser[];
  chatUsers: LoadUser[];
  /** Compose-a-set buyers: address + voucher, empty cart. */
  composeUsers: LoadUser[];
  /** Contention profile: accounts each shared by two or more VUs. */
  twinUsers: LoadUser[];
  /** Contention profile: the scarce variant every scarce VU buys, and the
   * limited voucher they fight over (both from the orchestrator). */
  scarceCatalog?: CatalogPick;
  scarceVoucherCode?: string;
}

/** k6 assigns VU ids across concurrently-running scenarios in whatever order
 * their goroutines start, not in contiguous per-scenario blocks (confirmed:
 * a 4-scenario run handed checkout_free the ids {10,12,13,21,22,25}, not
 * 1..6). `(vu - 1) % pool.length` on a pool sized to one scenario's own VU
 * count therefore collides across *different* VUs — e.g. 10 and 22 both land
 * on index 3 — handing two concurrently-running VUs the same pooled account.
 * Two VUs racing on one account's cart is exactly the scenario the checkout
 * privacy session exists to support, and it reproducibly 500s
 * (cart_items_cart_id_fkey) under load. The caller must size `pool` to the
 * run's total VU budget so `vu - 1` is a collision-free direct index. */
export function pickFromPool<T>(pool: T[], vu = __VU): T {
  if (!pool.length) throw new Error('empty load user pool');
  if (vu > pool.length) {
    throw new Error(
      `VU ${vu} exceeds load user pool size ${pool.length} — pool must cover the full VU budget`,
    );
  }
  return pool[vu - 1]!;
}

/** Twin accounts: the pool holds half as many accounts as the twin
 * scenario has VUs, so by pigeonhole every account is driven by two (or more)
 * VUs at once whatever ids k6 hands out (see pickFromPool). */
export function pickTwinFromPool<T>(pool: T[], vu = __VU): T {
  if (!pool.length) throw new Error('empty twin pool');
  return pool[(vu - 1) % pool.length]!;
}
