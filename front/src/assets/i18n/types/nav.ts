export interface NavStrings {
  home: string;
  gallery: string;
  galleryNail: string;
  /** Parent label when Collection and Composition collapse into one menu. */
  products: string;
  offer: string;
  about: string;
  /** parent label for the Guide dropdown */
  guide: string;
  /** Guide dropdown children */
  capsules: string;
  sizes: string;
  application: string;
  ordersActive: string;
  ordersHistory: string;
  /** Short label for the mobile bottom tab bar's Commandes tab. */
  ordersTab: string;
  contact: string;
  /** parent label for the merged Contact+About dropdown */
  info: string;
  /** "My Account" header control, logged-out and logged-in states */
  myAccount: string;
  /** Neutral aria for the profile icon while session bootstrap is unknown */
  accountIconAria: string;
  /** LoadingModal copy when the user opened account before auth settled */
  loadingAccount: string;
  account: string;
  admin: string;
  addresses: string;
  paymentMethods: string;
  loyalty: string;
  notifications: string;
  logout: string;
  logoutConfirmTitle: string;
  logoutConfirmMessage: string;
  /** LoadingModal shown between confirming logout and navigating away —
   * covers the server round trip (POST /auth/logout) plus local session
   * clearing, so the bottom nav bar never briefly shows the signed-in state
   * on the page it lands on (see AccountShell.tsx / MobileNav.tsx). */
  loggingOutLoading: string;
}
