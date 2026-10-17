/**
 * The shape of every setting this service reads.
 *
 * Kept apart from the values so "what can be configured" is readable without
 * scrolling through how each one is parsed.
 */
export interface AppConfig {
  target: string;
  /** false for both 'preprod' and 'prod' — anywhere real visitors or real
   * secrets are involved gets production-grade behavior (locked-down
   * CORS); only true local dev gets the relaxed default (see server.ts's
   * corsForFront). */
  isDevelopment: boolean;
  /** True only when APP_TARGET is exactly `prod`. Public SEO (indexable
   * meta, shop robots Allow, published sitemap) follows this flag, never
   * NODE_ENV. */
  isProduction: boolean;
  /** `HOME_REVIEWS_CACHE_TTL` (for example `14d` on prod): how long browsers
   * keep a complete `GET /reviews` answer. Null when unset: never cached. */
  homeReviewsCacheMs: number | null;
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
  /** Private contact-form image uploads — PRIVATE_DIR + PRIVATE_MEDIA_CONTACT_DIR.
   * Never web-served; emailed to the owner as attachments. */
  contactMediaDir: string;
  /** Private live-chat image uploads — PRIVATE_DIR + PRIVATE_MEDIA_CHAT_DIR.
   * Never web-served; filenames only in public APIs. */
  chatMediaDir: string;
  /** Max bytes per image after sharp normalization (contact / chat). */
  contactImageMaxBytes: number;
  chatImageMaxBytes: number;
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
  /** Private output written by the production loyalty cron. */
  cronLoyaltyLogFilePath: string;
  cronGiftLogFilePath: string;
  /** Private output written by the production gift-purge cron. */
  cronGiftPurgeLogFilePath: string;
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
  /** Separate output dir for "spy" copies (new order, new account, login,
   * ...) — DEV_DIR joined with DEV_EMAIL_SPY_DIR. Kept apart from
   * `devEmailDir` so the spy stream can be watched/emptied independently.
   * Same directory rule as `devEmailDir`. */
  devEmailSpyDir: string | undefined;
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
  /** Enables automatic/manual shipment tracking processing. */
  cronShipmentEnabled: boolean;
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
   * Sourced from FIELD_* in `.env/.public.env` so operators can tweak
   * without a code change. DB columns stay unbounded `text`. */
  fieldLimits: {
    emailMax: number;
    firstNameMax: number;
    lastNameMax: number;
    phoneMax: number;
    contactIdentityMax: number;
    contactMessageMax: number;
    productRequestCommentMax: number;
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
    voucherCodeMax: number;
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
    contactEmailWindowMs: number;
    contactEmailMax: number;
    authRefreshWindowMs: number;
    authRefreshMax: number;
    voucherWindowMs: number;
    voucherMax: number;
    checkoutWindowMs: number;
    checkoutMax: number;
    paymentWindowMs: number;
    paymentMax: number;
    galleryWindowMs: number;
    galleryMax: number;
    /** /operation/* — counts failed requests only (skipSuccessfulRequests). */
    opsWindowMs: number;
    opsMax: number;
    giftPinWindowMs: number;
    giftPinMax: number;
    giftCreateEmailWindowMs: number;
    giftCreateEmailMax: number;
    /** Giver's "Ma carte cadeau" download modal — edit, download, and
     * (re)email the share-card, each with its own budget, dedicated env
     * vars rather than reusing giftCreateEmail's or authRateLimiter's. */
    giftShareCardUpdateWindowMs: number;
    giftShareCardUpdateMax: number;
    giftShareCardDownloadWindowMs: number;
    giftShareCardDownloadMax: number;
    giftShareCardEmailWindowMs: number;
    giftShareCardEmailMax: number;
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
    disableContactEmail: boolean;
    disableGiftCreateEmail: boolean;
    disableGiftShareCardUpdate: boolean;
    disableGiftShareCardDownload: boolean;
    disableGiftShareCardEmail: boolean;
    disableInvoiceDownload: boolean;
    disableInvoiceEmail: boolean;
    disableAuthRefresh: boolean;
    disableVoucher: boolean;
    disableCheckout: boolean;
    disablePayment: boolean;
    disableGallery: boolean;
    disableOps: boolean;
    disableLogin: boolean;
    disableGiftPin: boolean;
    /** Min gap between spy emails for the same (kind, IP-or-user) key. */
    spyCooldownMs: number;
    /** Literal DISABLE_RATE_LIMIT_SPY_COOLDOWN=true sends a spy email on
     * every hit instead of respecting spyCooldownMs. Same dev-only gate as
     * the DISABLE_RATE_* flags above. */
    disableSpyCooldown: boolean;
    /** Mails of one purpose to one account in 24h before the owner is told.
     * A notification threshold, never a cap — see notifySendVolume. */
    sendVolumeSpyDay: number;
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
  /** How far ahead of an authorization hold's *estimated* expiry (Stripe
   * exposes no exact one for manual capture) the owner spy alert fires. */
  paymentAuthExpirySpyBeforeMs: number;
  /** Loyalty programme numbers. Enable/disable stays a Boutique admin
   * preference; these rates and windows need a process restart. */
  loyalty: {
    valuePer100: number;
    lotDurationMonths: number;
    burnNoticeWeeks: number;
    reminderIntervalDays: number;
  };
  /** Gift-offer TTLs, ceilings, and PIN/purge knobs. New offers are always
   * accepted. The leftover `gift_settings.enabled` column is not read. */
  gift: {
    receiverTokenTtlDays: number;
    /** How far out the giver's "prolonger" button may ever push
     * `offer_expires_at` (`GIFT_EXTEND_CEILING_DAYS`). */
    extendCeilingDays: number;
    lockSessionTtlHours: number;
    stockHoldTtlDays: number;
    giverPayTtlDays: number;
    /** Lead time before `offer_expires_at` for the giver's "not chosen yet"
     * mail (`GIFT_SELECT_REMINDER_BEFORE`). Sent once per expiry date. */
    selectReminderBeforeMs: number;
    /** Lead time before `hold_expires_at` for the stock-hold relance
     * (`GIFT_HOLD_REMINDER_BEFORE`). */
    holdReminderBeforeMs: number;
    /** Lead time before `pay_by_at` for the payment relance
     * (`GIFT_PAY_REMINDER_BEFORE`). */
    payReminderBeforeMs: number;
    visibilityAfterTerminalDays: number;
    /** Floor for an offer's sets budget (`GIFT_MIN_BUDGET`). Below it the
     * receiver could not buy anything, so create refuses. */
    minBudget: number;
    maxBudgetCeiling: number;
    maxAccessoryBudgetCeiling: number;
    maxOpenPromisesPerGiver: number;
    pinFreeFailures: number;
    pinMaxFailures: number;
    purgeAfterDays: number;
  };
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
  /** Days to keep a one-time (non-remembered) Stripe card attached after
   * order received/cancelled — see cardRetention.service.ts. */
  oneTimeCardRetentionDays: number;
  /** Blank in a fresh dev checkout (services/email.service.ts writes to
   * output/emails/ instead of sending when smtp.host is undefined); required
   * outside dev. */
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
  /** Seed-only inbox for `tuucho-mail-spy` channel `contact.inbound`. Live To
   * is Admin → Spy e-mails. Separate from EMAIL_NO_REPLY_FROM (sender). */
  contactRecipientEmail: string | undefined;
  /** Mailbox that sends and receives product-request replies. */
  requestSmtpUser: string | undefined;
  requestRecipientEmail: string | undefined;
  /** Seed-only mailbox for `tuucho-mail-spy` when it matches unlocked staff
   * and the recipients table is empty. Live To is Admin → Spy e-mails. */
  orderSpyRecipientEmail: string | undefined;
  /** Kill switch for every `spyTo` resolve (orders, contact inbound, chat
   * owner-notify, outage). Exact string `true` enables it. Does not disable
   * customer transactional mail or the chat SMTP pipe (`EMAIL_CHAT_FROM`). */
  disableSpyEmail: boolean;
  /** Chat SMTP transport. `fromEmail` (`EMAIL_CHAT_FROM`) is the piped
   * mailbox From/Reply-To and must stay env. `recipientEmail` is seed-only
   * for channel `contact.chat`. When `routeEmailFolder`, blank host writes
   * under DEV_EMAIL_CHAT_DIR instead of sending. */
  chatSmtp: {
    host: string | undefined;
    port: number | undefined;
    user: string | undefined;
    password: string | undefined;
    fromEmail: string | undefined;
    recipientEmail: string | undefined;
  };
  chatMaxSessionsPerUser: number;
  /** Maximum duration that an admin may mute owner-notify emails for incoming
   * customer chat messages. */
  adminChatOwnerEmailSuppressionTimeoutMs: number;
  /** Google Identity Services (Sign in with Google). Optional — endpoints
   * return `google_sign_in_disabled` when unset. */
  google: {
    clientId: string | undefined;
    signupTokenTtlMs: number;
  };
  /** Facebook Login. Optional — endpoints return `facebook_sign_in_disabled`
   * when app id or secret is unset. */
  facebook: {
    appId: string | undefined;
    appSecret: string | undefined;
    signupTokenTtlMs: number;
  };
  /** Sign in with Apple. Optional — endpoints return `apple_sign_in_disabled`
   * when the Services ID (`clientId`) is unset. `privateKey` is loaded from
   * `.env/<target>/AuthKey_<APPLE_KEY_ID>.p8` when that Key ID is set.
   * `s2sAudience` is an optional primary App ID for S2S notification JWTs
   * when Apple's `aud` differs from the Services ID. */
  apple: {
    clientId: string | undefined;
    teamId: string | undefined;
    keyId: string | undefined;
    privateKey: string | undefined;
    signupTokenTtlMs: number;
    s2sAudience: string | undefined;
  };
  /** Folder for chat owner-notify + transcript previews when
   * `routeEmailFolder`. */
  devEmailChatDir: string | undefined;
  /** Used to build the clickable links inside confirmation/reset emails
   * (the API itself never renders a page a user would land on). */
  frontendBaseUrl: string;
  /** Legal seller identity printed on generated invoice PDFs (see
   * invoicePdf.service.ts) — mirrors kernel/front's VITE_LEGAL_* block
   * shown on the legal-notice page (same values, duplicated here since the
   * two apps don't share an env system). `vatMention` is the exact
   * exemption sentence to print (e.g. "TVA non applicable, art. 293 B du
   * CGI" for a micro-entrepreneur) rather than a computed VAT breakdown. */
  company: {
    name: string;
    status: string;
    siren: string;
    address: string;
    vatMention: string;
    phone: string | undefined;
    email: string;
  };
  /** Blank in a fresh dev checkout (same convention as smtp above) — the
   * checkout/payment-methods routes respond 501 rather than throwing when
   * stripe.secretKey is undefined (see payments.service.ts), so a fresh
   * clone still boots without a Stripe account configured. webhookSecret
   * verifies the `Stripe-Signature` header on POST /webhooks/stripe (see
   * server.ts) — each environment (local `stripe listen`, preprod, prod)
   * has its own distinct whsec_ value, never shared across targets. */
  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
    /** Per-request Stripe network ceiling. Database payment markers make a
     * timed-out operation safe to resume with the same idempotency key. */
    timeoutMs: number;
  };
  /** Optional until the first carrier with label generation is configured.
   * Route codes/modes are public deploy configuration; credentials and the
   * sender address remain private. */
  mondialRelay: {
    api2Url: string | undefined;
    api2Enseigne: string | undefined;
    api2Login: string | undefined;
    api2Password: string | undefined;
    pointCourierCode: string | undefined;
    pointNetworkCode: string | undefined;
    pointDeliveryMode: string | undefined;
    homeCourierCode: string | undefined;
    homeNetworkCode: string | undefined;
    homeDeliveryMode: string | undefined;
    homeCollectionMode: string | undefined;
    collectionMode: string | undefined;
    senderName: string | undefined;
    senderLine1: string | undefined;
    senderPostalCode: string | undefined;
    senderCity: string | undefined;
    senderCountryCode: string | undefined;
    senderPhone: string | undefined;
    senderEmail: string | undefined;
    /** API1 (SOAP tracing) credentials — deliberately separate from the
     * API2/Connect credentials above: Mondial Relay issues distinct security
     * parameters per API, and API2 (label generation) cannot fetch tracing.
     * Optional until obtained; tracking simply stays unavailable until
     * filled in. */
    api1Url: string | undefined;
    api1Enseigne: string | undefined;
    api1PrivateKey: string | undefined;
    /** Mondial Relay's own public consumer tracking page, shown as a
     * fallback link alongside/instead of the embedded timeline (see
     * shippingTracking.service.ts). Per-environment like api1Url/api2Url in
     * case a distinct value is ever needed, though as of writing Mondial
     * Relay doesn't appear to run a separate sandbox tracking site — a
     * sandbox shipment number simply won't have a record on the production
     * one, which is harmless. */
    publicTrackingUrl: string | undefined;
    /** Delay between two carrier lookups in the shipment cron. This protects
     * the provider during a large backlog independently of the four-hour
     * per-shipment cache. */
    trackingThrottleMs: number;
    /** Hard limit for one WSI2 HTTP request, so a stalled carrier cannot
     * hold the whole cron batch until the outer cron command expires. */
    trackingTimeoutMs: number;
  };
}
