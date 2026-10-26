/**
 * The shape of every setting this service reads.
 *
 * Kept apart from the values so "what can be configured" is readable without
 * scrolling through how each one is parsed.
 */
export interface AppConfig {
  target: string;
  /** Supported-language configuration (`i18n.default` / `i18n.enabled` in
   * public JSON). `defaultLanguage` is the fallback for header/preference
   * resolution (utils/language.ts); `enabledLanguages` is what the storefront
   * bootstrap advertises to the front. Values are validated against
   * utils/language.ts's LANGUAGES at load. */
  i18n: {
    defaultLanguage: import('../utils/language.js').Language;
    enabledLanguages: import('../utils/language.js').Language[];
  };
  /** false for both 'preprod' and 'prod' — anywhere real visitors or real
   * secrets are involved gets production-grade behavior (locked-down
   * CORS); only true local dev gets the relaxed default (see server.ts's
   * corsForFront). */
  isDevelopment: boolean;
  /** True only when APP_TARGET is exactly `prod`. Public SEO (indexable
   * meta, shop robots Allow, published sitemap) follows this flag, never
   * NODE_ENV. */
  isProduction: boolean;
  publicDir: string;
  privateDir: string;
  devDir: string | undefined;
  /** Root for generated/dev artifacts (reports, caches, log downloads,
   * coverage). From `paths.outputDir` / OUTPUT_DIR; a relative value
   * resolves against the shop root, unset defaults to `<shopRoot>/output`.
   * When `paths.publicDir` / `paths.privateDir` / `paths.devDir` are not set
   * they fall back to `<outputDir>/public`, `<outputDir>/private` and
   * `<outputDir>/dev` respectively; an explicit per-key value always wins. */
  outputDir: string;
  /** When true, outbound mail is written under DEV_DIR / DEV_EMAIL_* instead
   * of SMTP (see email.service.ts / devEmailWriter.ts). Always on for `dev`.
   * On `preprod`, only when ROUTE_EMAIL_FOLDER=true. Always off for `prod`
   * (the env var is ignored there). */
  routeEmailFolder: boolean;
  /** Port this Node process itself binds to — in dev this is what you hit
   * directly (http://localhost:<port>); in preprod/prod it's purely
   * internal, Apache/Passenger is what actually faces the internet and
   * proxies to this port on localhost (see server.ts's trust-proxy
   * comment). Same value everywhere since nothing about that internal
   * wiring differs per target. */
  port: number;
  databaseUrl: string;
  /** Filesystem directory small/modal photos are written to and served
   * from — PUBLIC_DIR joined with PUBLIC_MEDIA_DIR. Web-accessible: it
   * sits inside the front's own docroot in production (Apache serves it
   * directly, see README "Deploying"); app.ts's own `/media`
   * express.static mount exists only for dev convenience, since there's no
   * separate Apache in front of `npm run dev`. */
  mediaDir: string;
  /** Generated files that must never be web-accessible — PRIVATE_DIR
   * joined with a feature-specific subfolder env var (PRIVATE_INVOICE_DIR,
   * PRIVATE_SHIPMENT_LABEL_DIR, ...), one property per feature so a
   * caller only ever sees its own directory rather than the shared private
   * root. Must point outside every deploy's own versioned release folder
   * or it's wiped on the next deploy — see README "Deploying". Files on
   * disk only, never as bytes in Postgres (project hard rule) — DB rows
   * store just the relative file name, see invoices.service.ts /
   * shippingLabels.service.ts. */
  invoiceDir: string;
  shipmentLabelDir: string;
  /** Fixture output for `npm run test` (invoice PDFs + rendered emails) —
   * PRIVATE_DIR joined with PRIVATE_TEST_DIR. Never web-served. */
  testDir: string;
  /** Database backup archives — PRIVATE_DIR joined with PRIVATE_BACKUP_DIR.
   * Holds whole-target snapshots (schema data + every media tree), so it is
   * never web-served and is itself excluded from what a backup captures. */
  backupDir: string;
  /** Opt-in structured request/response diagnostics. The admin preference
   * gates writing in every target, including production. */
  apiLog: {
    enabled: boolean;
    filePath: string;
    rotateMaxBytes: number;
    rotateMaxFiles: number;
    bodyMaxBytes: number;
  };
  /** Opt-in journal of mail that left the process. Production anonymises
   * personal data instead of refusing to write. */
  emailLog: {
    enabled: boolean;
    filePath: string;
  };
  /** Private output written by the production shipment-tracking cron. */
  cronShipmentLogFilePath: string;
  /** Private output written by the production account-deletion cron. */
  cronAccountDeletionLogFilePath: string;
  /** Private output written by the production guest-saved-cleanup cron. */
  cronGuestSavedCleanupLogFilePath: string;
  /** Private output written by the production payment-auth-expiry-spy cron. */
  cronPaymentAuthExpiryLogFilePath: string;
  /** Private failure-path output written by the production keep-warm cron. */
  cronWarmLogFilePath: string;
  /** Administration journal. One NDJSON line per change. */
  activityLogFilePath: string;
  /** How long a dated journal line with `at` is kept. `1y` is 365 days.
   * Applies to cron journals and the administration journal. */
  cronLogRetentionMs: number;
  /** Email preview root for customer/contact messages (see
   * devEmailWriter.ts) — DEV_DIR joined with DEV_EMAIL_USER_DIR. Resolved
   * in dev and preprod (preprod so a runtime folder-routing override can
   * write files). Undefined in prod. */
  devEmailDir: string | undefined;
  /** Square pixel size the small grid thumbnail is cropped to — see
   * media/storage.ts. The modal photo itself is never resized here (every
   * upload arrives already at modal quality/size — see that file's own
   * comment); this is the one dimension this backend still controls, so it
   * lives in the common public env, not per-target. */
  smallPhotoSize: number;
  /** Base URL prefix used to build the small/modal URLs returned by the
   * API — points at wherever these files are actually served from (Apache
   * static hosting in prod, this app's own /media route in local dev). */
  publicMediaUrl: string;
  /** AES-256-GCM key (base64, 32 bytes) + HMAC pepper for email_lookup.
   * Generated via `npm run operation -- generate-key db`. Never commit. */
  pii: {
    encryptionKey: string;
    lookupPepper: string;
  };
  /** Origin(s) allowed to call the public API with credentials — the
   * front's own origin(s) for this environment (preprod.shop.example for
   * preprod; both shop.example and www.shop.example for prod, since browsers
   * treat the apex and www as genuinely different origins even though
   * they're the same site — a single static header can only ever match one
   * at a time, so server.ts's corsForFront picks whichever of these
   * matches the actual request's Origin). Comma-separated in the env file.
   * Only required in production: in dev, corsForFront reflects whatever
   * Origin a request actually came from instead (Vite's port drifts), so
   * there's nothing meaningful to configure locally. */
  corsOrigins: string[] | undefined;
  /** User-account auth: short-lived signed access token + a separate
   * server-side-revocable refresh token (see services/token.service.ts) —
   * never one long-lived JWT, so logout/reset/deletion can actually kill a
   * session instead of waiting out its expiry. */
  jwt: {
    secret: string;
    /** Raw string, e.g. "15m" — passed straight to jsonwebtoken's own
     * `expiresIn`, which parses this shorthand itself. */
    accessTokenTtl: string;
  };
  /** Canonical public origin of this API. Used for HTTPS redirects and as
   * the access-token issuer; never derived from the request Host header. */
  apiBaseUrl: string;
  refreshToken: {
    ttlRememberMs: number;
    ttlSessionMs: number;
  };
  passwordMinLength: number;
  /** Hard ceiling before hashing — see PASSWORD_MAX_LENGTH. */
  passwordMaxLength: number;
  /** App-layer ceilings for customer-writable strings / quantities.
   * Sourced from kernel public JSON `fieldLimits` so operators can tweak
   * without a code change. DB columns stay unbounded `text`. */
  fieldLimits: {
    emailMax: number;
    firstNameMax: number;
    lastNameMax: number;
    phoneMax: number;
    addressLabelMax: number;
    recipientNameMax: number;
    companyNameMax: number;
    addressLineMax: number;
    deliveryNotesMax: number;
    postalCodeMax: number;
    cityMax: number;
    countryCodeMax: number;
    cardholderNameMax: number;
    cartNameMax: number;
    tokenMax: number;
    galleryCursorMax: number;
    cartQuantityMax: number;
    cartImportLinesMax: number;
    pickupPointIdMax: number;
    pickupMetadataKeysMax: number;
    pickupMetadataKeyMax: number;
    pickupMetadataValueMax: number;
    jsonBodyLimitKb: number;
  };
  /** Per-IP rate-limit windows for customer surfaces beyond login lockout. */
  rateLimits: {
    authWindowMs: number;
    authMax: number;
    authRefreshWindowMs: number;
    authRefreshMax: number;
    checkoutWindowMs: number;
    checkoutMax: number;
    paymentWindowMs: number;
    paymentMax: number;
    galleryWindowMs: number;
    galleryMax: number;
    /** /operation/* — counts failed requests only (skipSuccessfulRequests). */
    opsWindowMs: number;
    opsMax: number;
    /** "Ma Facture" modal's two actions, per-IP window+max, each its own
     * budget — downloading a cached PDF is lower-risk (idempotent, never
     * leaves the requesting user's own browser) than emailing it. */
    invoiceDownloadWindowMs: number;
    invoiceDownloadMax: number;
    invoiceEmailWindowMs: number;
    invoiceEmailMax: number;
    /**
     * Literal DISABLE_RATE_*=true skips the matching express-rate-limit.
     * Outside APP_TARGET=dev these flags are always forced false at load time.
     */
    disableAuth: boolean;
    disableInvoiceDownload: boolean;
    disableInvoiceEmail: boolean;
    disableAuthRefresh: boolean;
    disableCheckout: boolean;
    disablePayment: boolean;
    disableGallery: boolean;
    disableOps: boolean;
    disableLogin: boolean;
  };
  passwordResetTokenTtlMs: number;
  /** Per-user day/month cap on POST /auth/request-password-reset, same
   * log-table-plus-rolling-window shape as emailConfirmation's
   * resendLimitDay/Month (see passwordReset.service.ts's
   * checkPasswordResetLimit / password_reset_sends). This route never
   * returns a distinguishable response for "rate limited" vs "no such
   * account" vs "sent" — it's unauthenticated and deliberately always
   * responds the same way to avoid an account-enumeration oracle, so
   * hitting the limit silently skips the send but still reports success. */
  passwordReset: {
    limitDay: number;
    limitMonth: number;
  };
  emailConfirmation: {
    tokenTtlMs: number;
    /** Minimum gap since the last confirmation send before another is
     * allowed — a single last-sent-at check (see checkResendLimit), not a
     * count+window. */
    resendCooldownMs: number;
    /** Literal DISABLE_EMAIL_CONFIRMATION_RESEND_COOLDOWN=true skips the
     * cooldown entirely. Dev-only, same gate as the DISABLE_RATE_* flags. */
    disableResendCooldown: boolean;
    /** Consecutive wrong OTP submissions before the confirmation is burned. */
    maxAttempts: number;
  };
  /** Confirmation link sent to the NEW address after a step-up-unlocked
   * email change — deliberately much shorter than emailConfirmation's own
   * tokenTtlMs (registration confirmation), since this one always follows
   * an already-verified password re-entry. */
  emailChangeConfirmation: {
    tokenTtlMs: number;
  };
  /** Per-user cooldown on POST /account/change-email itself — independent
   * from emailConfirmation's own resendCooldownMs even though change-email
   * also records a send into that same email_confirmation_sends log:
   * conflating the two would mean a customer who just resent their
   * registration confirmation could find themselves unable to change their
   * email, which has nothing to do with it. This route is authenticated
   * (and already gated by a step-up unlock token), so unlike password
   * reset above it's fine to return an explicit 429 rather than silently
   * skipping. */
  emailChange: {
    cooldownMs: number;
    disableCooldown: boolean;
  };
  /** 6-digit signup/login/unlock OTP (see authOtp.service.ts). Shorter than
   * registration confirmation — this code is the credential itself.
   * verifyDelayMs is a response floor on verify/unlock-with-code (0 disables). */
  authOtp: {
    tokenTtlMs: number;
    cooldownMs: number;
    disableCooldown: boolean;
    maxAttempts: number;
    verifyDelayMs: number;
  };
  /** How long a step-up "unlock" token (see accountUnlock.service.ts) stays
   * valid and single-use after POST /account/unlock succeeds. */
  accountUnlock: {
    tokenTtlMs: number;
  };
  /** How long the "this wasn't me, lock my account" link (sent to the OLD
   * address on an email-change request) stays valid — see
   * accountSecurityLock.service.ts. Common across every target (same TTL
   * regardless of dev/preprod/prod), unlike most other token TTLs which
   * happen to also be common but are declared per-concept like this one. */
  accountSecurityLock: {
    tokenTtlMs: number;
  };
  /** A super-admin session refreshed after being idle at least this long
   * (`SUPER_ADMIN_SIGNIN_ALERT_IDLE`) counts as an automatic sign-in and
   * sends the sign-in alert; a refresh by an open tab (every access-token
   * lifetime) does not. */
  superAdminSignInAlert: {
    idleMs: number;
  };
  login: {
    maxFailedAttempts: number;
    lockoutDurationMs: number;
  };
  /** Past logins shown in the account page's "recent logins" block — see
   * GET /account/recent-logins. 0 hides the block entirely (services/
   * token.service.ts's listRecentLogins just returns an empty list). */
  recentLoginsDisplayCount: number;
  /** How long an unpaid checkout keeps its stock allocation. */
  stockReservationTtlMs: number;
  /** Sliding inactivity timeout for tab-scoped sensitive checkout state. */
  checkoutPrivacySessionIdleTtlMs: number;
  /** How long a customer edit lock blocks ops set-status (see
   * orders.service.ts acquireRevisionLock / setStatus). */
  orderRevisionLockTtlMs: number;
  /** Hard cumulative cap on customer address amendments per order. */
  orderRevisionMax: number;
  /** Soft cap on named carts per authenticated user. */
  cartMaxPerUser: number;
  /** How long after `confirmed_at` a guest order may still be re-integrated
   * into an account through the integrity-code claim flow
   * (GET /account/guest-orders → POST /account/guest-orders/:id/claim).
   *
   * Distinct from EMAIL_CONFIRMATION_TOKEN_TTL, which bounds the emailed
   * "manage my order" link: that one is inbox proof and expires fast, while
   * the integrity code is printed on the order itself, so possession stays
   * meaningful for longer. Applies only to orders actually *placed* as guest —
   * an order orphaned by an account deletion carries no `guest_email` at all
   * and is never claimable, whatever this is set to. */
  guestOrderClaimWindowMs: number;
  /** Connection-pool bounds. Defaults matter here: node-postgres ships
   * `connectionTimeoutMillis: 0`, i.e. wait forever, so on a shared-hosting
   * Postgres one slow query exhausted the pool and every later request queued
   * indefinitely instead of failing. `statementTimeoutMs` is applied per
   * connection via libpq options. */
  database: {
    poolMax: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
  };
  accountDeletion: {
    gracePeriodDays: number;
    reminderDaysBeforeDays: number;
  };
  /** Blank in a fresh dev checkout (devEmailWriter.ts writes the message
   * under config.devEmailDir instead of sending when smtp.host is
   * undefined); required outside dev. */
  smtp: {
    host: string | undefined;
    port: number | undefined;
    fromEmail: string | undefined;
    /** Literal subject-line prefix (e.g. "Preprod: ", "Dev: "), applied once
     * in sendMail() to every outgoing subject — lets a shared inbox tell a
     * staging/dev email apart from a real one at a glance. Always defined,
     * empty string in prod where no prefix is wanted. Deliberately not a
     * From-header display name (that was SMTP_FROM_NAME, now removed):
     * subject text belongs to the per-email i18n templates instead, see
     * services/emailContent.ts. */
    fromNamePrefix: string;
    user: string | undefined;
    password: string | undefined;
  };
  /** Used to build the clickable links inside confirmation/reset emails
   * (the API itself never renders a page a user would land on). */
  frontendBaseUrl: string;
}
