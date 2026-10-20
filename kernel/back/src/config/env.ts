/**
 * The assembled configuration.
 *
 * Sources are layered in `envSources.ts` from kernel JSON (`config/` common
 * then `config/<env>/`, private overlays), validated by `envParsers.ts`, and
 * described by `appConfig.ts`. This file only puts the values together, so
 * `config` stays a single import for the modules that read it. Shop identity,
 * Stripe, Mondial Relay, gift, loyalty, contact, spy, and sign-in provider
 * knobs are not kernel JSON.
 */
import { join, resolve } from 'node:path';
import type { AppConfig } from './appConfig.js';
import { targetFileSuffix } from './envSources.js';
import {
  optionalDurationMs,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalPositiveIntegerUnlessDeployed,
  optionalUnlessDeployed,
  required,
  requiredByteSize,
  requiredDurationMs,
  requiredHttpOrigin,
  requiredList,
  requiredIntegerPair,
  requiredPositiveInteger,
  requiredRateLimit,
} from './envParsers.js';

/** Spreads one `RATE_*=<duration>:<count>` env var into the two config
 * fields a named limiter needs (see middleware/rateLimiters.ts). */
function rateLimitFields<W extends string, M extends string>(
  value: string | undefined,
  name: string,
  windowKey: W,
  maxKey: M,
): Record<W, number> & Record<M, number> {
  const { windowMs, limit } = requiredRateLimit(value, name);
  return { [windowKey]: windowMs, [maxKey]: limit } as Record<W, number> & Record<M, number>;
}

export type { AppConfig } from './appConfig.js';
export type { AppTarget } from './envSources.js';

const isDevelopment = targetFileSuffix === 'dev';
/** Folder-route outbound mail: always in dev; preprod only when
 * ROUTE_EMAIL_FOLDER=true; never in prod (env ignored). Plain process env,
 * no DB override — the preprod functional-test harness flips this by
 * setting the real cPanel env var and restarting the app (see
 * scripts/lwsEnvVar.ts), not by writing a preference row, so the deployed
 * env is always the single source of truth for what this process is
 * actually doing. The dump dirs below still resolve on preprod even when
 * this is false, since `GET /operation/email-folder/mails` reads them
 * independently of whether outbound mail is currently folder-routed. */
const routeEmailFolder =
  isDevelopment || (targetFileSuffix === 'preprod' && process.env.ROUTE_EMAIL_FOLDER === 'true');
const emailFolderDirsNeeded = isDevelopment || targetFileSuffix === 'preprod';

// Base directories — joined with a feature-specific subfolder env var
// below rather than exposed directly, so each caller only ever sees its
// own resolved directory (config.mediaDir, config.invoiceDir, ...).
const publicDir = required(process.env.PUBLIC_DIR, 'PUBLIC_DIR');
const privateDir = required(process.env.PRIVATE_DIR, 'PRIVATE_DIR');

function privateLogFilePath(value: string | undefined, variableName: string): string {
  // Private-path variables in this project use `/subdir/file` notation even
  // though they are rooted inside PRIVATE_DIR.  Strip that cosmetic leading
  // separator before resolving, while still rejecting traversal outside the
  // private tree.
  const relative = required(value, variableName).replace(/^[/\\]+/, '');
  const resolved = resolve(privateDir, relative);
  const privateRoot = resolve(privateDir);
  if (resolved !== privateRoot && !resolved.startsWith(`${privateRoot}/`)) {
    throw new Error(`${variableName} must stay within PRIVATE_DIR.`);
  }
  return resolved;
}
// Email preview dump root. Required in dev, and on preprod so a runtime
// folder-routing override can write files. Prod never resolves these.
const devDir = emailFolderDirsNeeded ? required(process.env.DEV_DIR, 'DEV_DIR') : undefined;

export const config: AppConfig = {
  target: targetFileSuffix,
  isDevelopment,
  isProduction: targetFileSuffix === 'prod',
  routeEmailFolder,
  publicDir,
  privateDir,
  devDir,
  port: optionalPositiveInteger(process.env.APP_PORT, 3000),
  databaseUrl: required(process.env.DATABASE_URL, 'DATABASE_URL'),
  mediaDir: join(publicDir, required(process.env.PUBLIC_MEDIA_DIR, 'PUBLIC_MEDIA_DIR')),
  invoiceDir: join(privateDir, required(process.env.PRIVATE_INVOICE_DIR, 'PRIVATE_INVOICE_DIR')),
  shipmentLabelDir: join(
    privateDir,
    required(process.env.PRIVATE_SHIPMENT_LABEL_DIR, 'PRIVATE_SHIPMENT_LABEL_DIR'),
  ),
  testDir: join(privateDir, required(process.env.PRIVATE_TEST_DIR, 'PRIVATE_TEST_DIR')),
  backupDir: join(privateDir, required(process.env.PRIVATE_BACKUP_DIR, 'PRIVATE_BACKUP_DIR')),
  apiLog: {
    enabled: process.env.ENABLED_API_LOG === 'true',
    filePath: privateLogFilePath(process.env.PRIVATE_LOG_API_FILE, 'PRIVATE_LOG_API_FILE'),
    rotateMaxBytes: requiredByteSize(process.env.API_LOG_ROTATE_MAX_BYTES, 'API_LOG_ROTATE_MAX_BYTES'),
    rotateMaxFiles: requiredPositiveInteger(process.env.API_LOG_ROTATE_MAX_FILES, 'API_LOG_ROTATE_MAX_FILES'),
    bodyMaxBytes: requiredByteSize(process.env.API_LOG_BODY_MAX_BYTES, 'API_LOG_BODY_MAX_BYTES'),
  },
  emailLog: {
    enabled: process.env.ENABLED_EMAIL_LOG === 'true',
    filePath: privateLogFilePath(process.env.PRIVATE_LOG_EMAIL_FILE, 'PRIVATE_LOG_EMAIL_FILE'),
  },
  cronShipmentLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_SHIPMENT_FILE,
    'PRIVATE_LOG_CRON_SHIPMENT_FILE',
  ),
  cronAccountDeletionLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE,
    'PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE',
  ),
  cronGuestSavedCleanupLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_GUEST_SAVED_CLEANUP_FILE,
    'PRIVATE_LOG_CRON_GUEST_SAVED_CLEANUP_FILE',
  ),
  cronPaymentAuthExpiryLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_PAYMENT_AUTH_EXPIRY_FILE,
    'PRIVATE_LOG_CRON_PAYMENT_AUTH_EXPIRY_FILE',
  ),
  cronWarmLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_WARM_FILE,
    'PRIVATE_LOG_CRON_WARM_FILE',
  ),
  activityLogFilePath: privateLogFilePath(process.env.PRIVATE_LOG_ACTIVITY_FILE, 'PRIVATE_LOG_ACTIVITY_FILE'),
  cronLogRetentionMs: optionalDurationMs(process.env.CRON_LOG_RETENTION, '1y', 'CRON_LOG_RETENTION'),
  devEmailDir: emailFolderDirsNeeded
    ? join(devDir!, required(process.env.DEV_EMAIL_USER_DIR, 'DEV_EMAIL_USER_DIR'))
    : undefined,
  smallPhotoSize: optionalPositiveInteger(process.env.SMALL_PHOTO_SIZE, 400),
  publicMediaUrl: required(process.env.URL_PUBLIC_MEDIA, 'URL_PUBLIC_MEDIA').replace(/\/$/, ''),
  pii: {
    encryptionKey: required(process.env.PII_ENCRYPTION_KEY, 'PII_ENCRYPTION_KEY'),
    lookupPepper: required(process.env.PII_LOOKUP_PEPPER, 'PII_LOOKUP_PEPPER'),
  },
  corsOrigins:
    isDevelopment && (process.env.CORS_ORIGIN ?? '').trim() === ''
      ? undefined
      : requiredList(process.env.CORS_ORIGIN, 'CORS_ORIGIN'),
  jwt: {
    secret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
    accessTokenTtl: required(process.env.JWT_ACCESS_TOKEN_TTL, 'JWT_ACCESS_TOKEN_TTL'),
  },
  apiBaseUrl: requiredHttpOrigin(process.env.URL_API_BASE, 'URL_API_BASE'),
  refreshToken: {
    ttlRememberMs: requiredDurationMs(
      process.env.JWT_REFRESH_TOKEN_TTL_REMEMBER,
      'JWT_REFRESH_TOKEN_TTL_REMEMBER',
    ),
    ttlSessionMs: requiredDurationMs(
      process.env.JWT_REFRESH_TOKEN_TTL_SESSION,
      'JWT_REFRESH_TOKEN_TTL_SESSION',
    ),
  },
  passwordMinLength: requiredPositiveInteger(process.env.PASSWORD_MIN_LENGTH, 'PASSWORD_MIN_LENGTH'),
  passwordMaxLength: requiredPositiveInteger(process.env.PASSWORD_MAX_LENGTH, 'PASSWORD_MAX_LENGTH'),
  fieldLimits: {
    emailMax: requiredPositiveInteger(process.env.FIELD_EMAIL_MAX, 'FIELD_EMAIL_MAX'),
    firstNameMax: requiredPositiveInteger(process.env.FIELD_FIRST_NAME_MAX, 'FIELD_FIRST_NAME_MAX'),
    lastNameMax: requiredPositiveInteger(process.env.FIELD_LAST_NAME_MAX, 'FIELD_LAST_NAME_MAX'),
    phoneMax: requiredPositiveInteger(process.env.FIELD_PHONE_MAX, 'FIELD_PHONE_MAX'),
    addressLabelMax: requiredPositiveInteger(process.env.FIELD_ADDRESS_LABEL_MAX, 'FIELD_ADDRESS_LABEL_MAX'),
    recipientNameMax: requiredPositiveInteger(
      process.env.FIELD_RECIPIENT_NAME_MAX,
      'FIELD_RECIPIENT_NAME_MAX',
    ),
    companyNameMax: requiredPositiveInteger(process.env.FIELD_COMPANY_NAME_MAX, 'FIELD_COMPANY_NAME_MAX'),
    addressLineMax: requiredPositiveInteger(process.env.FIELD_ADDRESS_LINE_MAX, 'FIELD_ADDRESS_LINE_MAX'),
    deliveryNotesMax: requiredPositiveInteger(
      process.env.FIELD_DELIVERY_NOTES_MAX,
      'FIELD_DELIVERY_NOTES_MAX',
    ),
    postalCodeMax: requiredPositiveInteger(process.env.FIELD_POSTAL_CODE_MAX, 'FIELD_POSTAL_CODE_MAX'),
    cityMax: requiredPositiveInteger(process.env.FIELD_CITY_MAX, 'FIELD_CITY_MAX'),
    countryCodeMax: requiredPositiveInteger(process.env.FIELD_COUNTRY_CODE_MAX, 'FIELD_COUNTRY_CODE_MAX'),
    cardholderNameMax: requiredPositiveInteger(
      process.env.FIELD_CARDHOLDER_NAME_MAX,
      'FIELD_CARDHOLDER_NAME_MAX',
    ),
    cartNameMax: requiredPositiveInteger(process.env.FIELD_CART_NAME_MAX, 'FIELD_CART_NAME_MAX'),
    tokenMax: requiredPositiveInteger(process.env.FIELD_TOKEN_MAX, 'FIELD_TOKEN_MAX'),
    galleryCursorMax: requiredPositiveInteger(
      process.env.FIELD_GALLERY_CURSOR_MAX,
      'FIELD_GALLERY_CURSOR_MAX',
    ),
    cartQuantityMax: requiredPositiveInteger(process.env.FIELD_CART_QUANTITY_MAX, 'FIELD_CART_QUANTITY_MAX'),
    cartImportLinesMax: requiredPositiveInteger(
      process.env.FIELD_CART_IMPORT_LINES_MAX,
      'FIELD_CART_IMPORT_LINES_MAX',
    ),
    pickupPointIdMax: requiredPositiveInteger(
      process.env.FIELD_PICKUP_POINT_ID_MAX,
      'FIELD_PICKUP_POINT_ID_MAX',
    ),
    pickupMetadataKeysMax: requiredPositiveInteger(
      process.env.FIELD_PICKUP_METADATA_KEYS_MAX,
      'FIELD_PICKUP_METADATA_KEYS_MAX',
    ),
    pickupMetadataKeyMax: requiredPositiveInteger(
      process.env.FIELD_PICKUP_METADATA_KEY_MAX,
      'FIELD_PICKUP_METADATA_KEY_MAX',
    ),
    pickupMetadataValueMax: requiredPositiveInteger(
      process.env.FIELD_PICKUP_METADATA_VALUE_MAX,
      'FIELD_PICKUP_METADATA_VALUE_MAX',
    ),
    jsonBodyLimitKb: requiredPositiveInteger(
      process.env.FIELD_JSON_BODY_LIMIT_KB,
      'FIELD_JSON_BODY_LIMIT_KB',
    ),
  },
  rateLimits: {
    ...rateLimitFields(process.env.RATE_AUTH, 'RATE_AUTH', 'authWindowMs', 'authMax'),
    ...rateLimitFields(
      process.env.RATE_AUTH_REFRESH,
      'RATE_AUTH_REFRESH',
      'authRefreshWindowMs',
      'authRefreshMax',
    ),
    ...rateLimitFields(process.env.RATE_CHECKOUT, 'RATE_CHECKOUT', 'checkoutWindowMs', 'checkoutMax'),
    ...rateLimitFields(process.env.RATE_PAYMENT, 'RATE_PAYMENT', 'paymentWindowMs', 'paymentMax'),
    ...rateLimitFields(process.env.RATE_GALLERY, 'RATE_GALLERY', 'galleryWindowMs', 'galleryMax'),
    ...rateLimitFields(process.env.RATE_OPS, 'RATE_OPS', 'opsWindowMs', 'opsMax'),
    ...rateLimitFields(
      process.env.RATE_INVOICE_DOWNLOAD,
      'RATE_INVOICE_DOWNLOAD',
      'invoiceDownloadWindowMs',
      'invoiceDownloadMax',
    ),
    ...rateLimitFields(
      process.env.RATE_INVOICE_EMAIL,
      'RATE_INVOICE_EMAIL',
      'invoiceEmailWindowMs',
      'invoiceEmailMax',
    ),
    disableAuth: isDevelopment && process.env.DISABLE_RATE_AUTH === 'true',
    disableInvoiceDownload: isDevelopment && process.env.DISABLE_RATE_INVOICE_DOWNLOAD === 'true',
    disableInvoiceEmail: isDevelopment && process.env.DISABLE_RATE_INVOICE_EMAIL === 'true',
    disableAuthRefresh: isDevelopment && process.env.DISABLE_RATE_AUTH_REFRESH === 'true',
    disableCheckout: isDevelopment && process.env.DISABLE_RATE_CHECKOUT === 'true',
    disablePayment: isDevelopment && process.env.DISABLE_RATE_PAYMENT === 'true',
    disableGallery: isDevelopment && process.env.DISABLE_RATE_GALLERY === 'true',
    disableOps: isDevelopment && process.env.DISABLE_RATE_OPS === 'true',
    disableLogin: isDevelopment && process.env.DISABLE_RATE_LOGIN === 'true',
  },
  passwordResetTokenTtlMs: requiredDurationMs(
    process.env.PASSWORD_RESET_TOKEN_TTL,
    'PASSWORD_RESET_TOKEN_TTL',
  ),
  passwordReset: (([limitDay, limitMonth]) => ({ limitDay, limitMonth }))(
    requiredIntegerPair(process.env.PASSWORD_RESET_LIMIT, 'PASSWORD_RESET_LIMIT'),
  ),
  emailConfirmation: {
    tokenTtlMs: requiredDurationMs(process.env.EMAIL_CONFIRMATION_TOKEN_TTL, 'EMAIL_CONFIRMATION_TOKEN_TTL'),
    resendCooldownMs: requiredDurationMs(
      process.env.EMAIL_CONFIRMATION_RESEND_COOLDOWN,
      'EMAIL_CONFIRMATION_RESEND_COOLDOWN',
    ),
    disableResendCooldown: isDevelopment && process.env.DISABLE_EMAIL_CONFIRMATION_RESEND_COOLDOWN === 'true',
    maxAttempts: optionalPositiveInteger(process.env.EMAIL_CONFIRMATION_MAX_ATTEMPTS, 5),
  },
  emailChangeConfirmation: {
    tokenTtlMs: requiredDurationMs(
      process.env.EMAIL_CHANGE_CONFIRMATION_TOKEN_TTL,
      'EMAIL_CHANGE_CONFIRMATION_TOKEN_TTL',
    ),
  },
  emailChange: {
    cooldownMs: requiredDurationMs(process.env.EMAIL_CHANGE_COOLDOWN, 'EMAIL_CHANGE_COOLDOWN'),
    disableCooldown: isDevelopment && process.env.DISABLE_EMAIL_CHANGE_COOLDOWN === 'true',
  },
  authOtp: {
    tokenTtlMs: requiredDurationMs(process.env.AUTH_OTP_TOKEN_TTL, 'AUTH_OTP_TOKEN_TTL'),
    cooldownMs: requiredDurationMs(process.env.AUTH_OTP_COOLDOWN, 'AUTH_OTP_COOLDOWN'),
    disableCooldown: isDevelopment && process.env.DISABLE_AUTH_OTP_COOLDOWN === 'true',
    maxAttempts: requiredPositiveInteger(process.env.AUTH_OTP_MAX_ATTEMPTS, 'AUTH_OTP_MAX_ATTEMPTS'),
    verifyDelayMs: requiredDurationMs(process.env.AUTH_OTP_VERIFY_DELAY, 'AUTH_OTP_VERIFY_DELAY'),
  },
  accountUnlock: {
    tokenTtlMs: requiredDurationMs(process.env.ACCOUNT_UNLOCK_TOKEN_TTL, 'ACCOUNT_UNLOCK_TOKEN_TTL'),
  },
  accountSecurityLock: {
    tokenTtlMs: requiredDurationMs(
      process.env.ACCOUNT_SECURITY_LOCK_TOKEN_TTL,
      'ACCOUNT_SECURITY_LOCK_TOKEN_TTL',
    ),
  },
  superAdminSignInAlert: {
    idleMs: requiredDurationMs(process.env.SUPER_ADMIN_SIGNIN_ALERT_IDLE, 'SUPER_ADMIN_SIGNIN_ALERT_IDLE'),
  },

  login: (({ windowMs, limit }) => ({ maxFailedAttempts: limit, lockoutDurationMs: windowMs }))(
    requiredRateLimit(process.env.LOGIN_LOCKOUT, 'LOGIN_LOCKOUT'),
  ),
  recentLoginsDisplayCount: optionalNonNegativeInteger(process.env.RECENT_LOGINS_DISPLAY_COUNT, 3),
  stockReservationTtlMs: requiredDurationMs(process.env.STOCK_RESERVATION_TTL, 'STOCK_RESERVATION_TTL'),
  checkoutPrivacySessionIdleTtlMs: requiredDurationMs(
    process.env.CHECKOUT_PRIVACY_SESSION_IDLE_TTL,
    'CHECKOUT_PRIVACY_SESSION_IDLE_TTL',
  ),
  orderRevisionLockTtlMs: requiredDurationMs(process.env.ORDER_REVISION_LOCK_TTL, 'ORDER_REVISION_LOCK_TTL'),
  orderRevisionMax: requiredPositiveInteger(process.env.ORDER_REVISION_MAX, 'ORDER_REVISION_MAX'),
  /** Soft cap on ordinary named carts per authenticated user (create /
   * rebuy-as-new / guest import-as-new); default and Wish List are exempt. */
  cartMaxPerUser: requiredPositiveInteger(process.env.CART_MAX_PER_USER, 'CART_MAX_PER_USER'),
  guestOrderClaimWindowMs: requiredDurationMs(
    process.env.GUEST_ORDER_CLAIM_WINDOW,
    'GUEST_ORDER_CLAIM_WINDOW',
  ),
  database: {
    poolMax: optionalPositiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMs: optionalDurationMs(
      process.env.DATABASE_POOL_IDLE_TIMEOUT,
      '30s',
      'DATABASE_POOL_IDLE_TIMEOUT',
    ),
    connectionTimeoutMs: optionalDurationMs(
      process.env.DATABASE_POOL_CONNECTION_TIMEOUT,
      '5s',
      'DATABASE_POOL_CONNECTION_TIMEOUT',
    ),
    // Well above any legitimate request-path query, well below "forever" —
    // ops paths (imports, delete-all) run single statements far under this.
    // `off` disables it: it travels in the connection startup packet, and a
    // provider fronted by a connection pooler can refuse unknown startup
    // parameters, which would fail every connection rather than one query.
    statementTimeoutMs:
      process.env.DATABASE_STATEMENT_TIMEOUT === 'off'
        ? 0
        : optionalDurationMs(process.env.DATABASE_STATEMENT_TIMEOUT, '30s', 'DATABASE_STATEMENT_TIMEOUT'),
  },
  accountDeletion: {
    gracePeriodDays: requiredPositiveInteger(
      process.env.ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
      'ACCOUNT_DELETION_GRACE_PERIOD_DAYS',
    ),
    reminderDaysBeforeDays: requiredPositiveInteger(
      process.env.DELETION_REMINDER_DAYS_BEFORE,
      'DELETION_REMINDER_DAYS_BEFORE',
    ),
  },
  smtp: {
    host: optionalUnlessDeployed(process.env.SMTP_HOST, 'SMTP_HOST', routeEmailFolder),
    port: optionalPositiveIntegerUnlessDeployed(process.env.SMTP_PORT, 'SMTP_PORT', routeEmailFolder),
    fromEmail: optionalUnlessDeployed(
      process.env.EMAIL_NO_REPLY_FROM,
      'EMAIL_NO_REPLY_FROM',
      routeEmailFolder,
    ),
    fromNamePrefix: process.env.SMTP_FROM_NAME_PREFIX ?? '',
    user: optionalUnlessDeployed(process.env.SMTP_NO_REPLY_USER, 'SMTP_NO_REPLY_USER', routeEmailFolder),
    password: optionalUnlessDeployed(
      process.env.SMTP_NO_REPLY_PASSWORD,
      'SMTP_NO_REPLY_PASSWORD',
      routeEmailFolder,
    ),
  },
  frontendBaseUrl: required(process.env.URL_FRONTEND_BASE, 'URL_FRONTEND_BASE'),
};
