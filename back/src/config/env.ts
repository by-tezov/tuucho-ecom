/**
 * The assembled configuration.
 *
 * Sources are layered in `envSources.ts`, validated by `envParsers.ts`, and
 * described by `appConfig.ts`. This file only puts the values together, so
 * `config` stays a single import for the 98 modules that read it.
 */
import { join, resolve } from 'node:path';
import type { AppConfig } from './appConfig.js';
import { targetFileSuffix, loadApplePrivateKeyFromFile } from './envSources.js';
import {
  durationMsOrNull,
  optionalDurationMs,
  optionalNonNegativeInteger,
  optionalPositiveInteger,
  optionalPositiveIntegerUnlessDeployed,
  optionalUnlessDeployed,
  required,
  requiredByteSize,
  requiredDurationMs,
  requiredHttpOrigin,
  requiredIntegerInRange,
  requiredList,
  requiredIntegerPair,
  requiredNumberInRange,
  requiredPositiveInteger,
  requiredRateLimit,
} from './envParsers.js';

const LOYALTY_LOT_DURATION_MONTHS = [1, 2, 3, 4, 6, 12] as const;

function requiredLotDurationMonths(
  value: string | undefined,
  name: string,
): (typeof LOYALTY_LOT_DURATION_MONTHS)[number] {
  const months = requiredIntegerInRange(value, name, 1, 12);
  if (!(LOYALTY_LOT_DURATION_MONTHS as readonly number[]).includes(months)) {
    throw new Error(`${name} must be one of 1, 2, 3, 4, 6, 12.`);
  }
  return months as (typeof LOYALTY_LOT_DURATION_MONTHS)[number];
}

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

/** Read here rather than inline in `config.gift` so the two can be compared:
 * a floor above the ceiling would refuse every create at runtime, which is a
 * deployment mistake worth failing at startup instead. */
const giftMinBudget = requiredNumberInRange(process.env.GIFT_MIN_BUDGET, 'GIFT_MIN_BUDGET', 1, 9999.99);
const giftMaxBudgetCeiling = requiredNumberInRange(
  process.env.GIFT_MAX_BUDGET_CEILING,
  'GIFT_MAX_BUDGET_CEILING',
  1,
  9999.99,
);
if (giftMinBudget > giftMaxBudgetCeiling) {
  throw new Error('GIFT_MIN_BUDGET must not exceed GIFT_MAX_BUDGET_CEILING.');
}

export const config: AppConfig = {
  target: targetFileSuffix,
  isDevelopment,
  homeReviewsCacheMs: durationMsOrNull(process.env.HOME_REVIEWS_CACHE_TTL, 'HOME_REVIEWS_CACHE_TTL'),
  routeEmailFolder,
  port: optionalPositiveInteger(process.env.PAM_TEST_PORT ?? process.env.APP_PORT, 3000),
  // Playwright starts a dedicated local server with this explicit override.
  // Keeping the override separate from DATABASE_URL means the normal layered
  // dev/private env loading cannot accidentally point that server back at the
  // developer database.
  databaseUrl: required(process.env.PAM_TEST_DATABASE_URL ?? process.env.DATABASE_URL, 'DATABASE_URL'),
  mediaDir: join(publicDir, required(process.env.PUBLIC_MEDIA_DIR, 'PUBLIC_MEDIA_DIR')),
  invoiceDir: join(privateDir, required(process.env.PRIVATE_INVOICE_DIR, 'PRIVATE_INVOICE_DIR')),
  shipmentLabelDir: join(
    privateDir,
    required(process.env.PRIVATE_SHIPMENT_LABEL_DIR, 'PRIVATE_SHIPMENT_LABEL_DIR'),
  ),
  contactMediaDir: join(
    privateDir,
    required(process.env.PRIVATE_MEDIA_CONTACT_DIR, 'PRIVATE_MEDIA_CONTACT_DIR'),
  ),
  chatMediaDir: join(privateDir, required(process.env.PRIVATE_MEDIA_CHAT_DIR, 'PRIVATE_MEDIA_CHAT_DIR')),
  contactImageMaxBytes: requiredByteSize(process.env.CONTACT_IMAGE_MAX_BYTES, 'CONTACT_IMAGE_MAX_BYTES'),
  chatImageMaxBytes: requiredByteSize(process.env.CHAT_IMAGE_MAX_BYTES, 'CHAT_IMAGE_MAX_BYTES'),
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
  cronLoyaltyLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_LOYALTY_FILE,
    'PRIVATE_LOG_CRON_LOYALTY_FILE',
  ),
  cronGiftLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_GIFT_FILE,
    'PRIVATE_LOG_CRON_GIFT_FILE',
  ),
  cronGiftPurgeLogFilePath: privateLogFilePath(
    process.env.PRIVATE_LOG_CRON_GIFT_PURGE_FILE,
    'PRIVATE_LOG_CRON_GIFT_PURGE_FILE',
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
  devEmailSpyDir: emailFolderDirsNeeded
    ? join(devDir!, required(process.env.DEV_EMAIL_SPY_DIR, 'DEV_EMAIL_SPY_DIR'))
    : undefined,
  devEmailChatDir: emailFolderDirsNeeded
    ? join(devDir!, required(process.env.DEV_EMAIL_CHAT_DIR, 'DEV_EMAIL_CHAT_DIR'))
    : undefined,
  smallPhotoSize: optionalPositiveInteger(process.env.SMALL_PHOTO_SIZE, 400),
  publicMediaUrl: required(
    process.env.PAM_TEST_PUBLIC_MEDIA_URL ?? process.env.URL_PUBLIC_MEDIA,
    'URL_PUBLIC_MEDIA',
  ).replace(/\/$/, ''),
  pii: {
    encryptionKey: required(process.env.PII_ENCRYPTION_KEY, 'PII_ENCRYPTION_KEY'),
    lookupPepper: required(process.env.PII_LOOKUP_PEPPER, 'PII_LOOKUP_PEPPER'),
  },
  cronShipmentEnabled: process.env.ENABLED_CRON_SHIPMENT === 'true',
  corsOrigins:
    isDevelopment && (process.env.CORS_ORIGIN ?? '').trim() === ''
      ? undefined
      : requiredList(process.env.CORS_ORIGIN, 'CORS_ORIGIN'),
  jwt: {
    secret: required(process.env.JWT_SECRET, 'JWT_SECRET'),
    accessTokenTtl: required(process.env.JWT_ACCESS_TOKEN_TTL, 'JWT_ACCESS_TOKEN_TTL'),
  },
  apiBaseUrl: requiredHttpOrigin(
    process.env.PAM_TEST_API_BASE_URL ?? process.env.URL_API_BASE,
    'URL_API_BASE',
  ),
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
    contactIdentityMax: requiredPositiveInteger(
      process.env.FIELD_CONTACT_IDENTITY_MAX,
      'FIELD_CONTACT_IDENTITY_MAX',
    ),
    contactMessageMax: requiredPositiveInteger(
      process.env.FIELD_CONTACT_MESSAGE_MAX,
      'FIELD_CONTACT_MESSAGE_MAX',
    ),
    productRequestCommentMax: requiredPositiveInteger(
      process.env.FIELD_PRODUCT_REQUEST_COMMENT_MAX,
      'FIELD_PRODUCT_REQUEST_COMMENT_MAX',
    ),
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
    voucherCodeMax: requiredPositiveInteger(process.env.FIELD_VOUCHER_CODE_MAX, 'FIELD_VOUCHER_CODE_MAX'),
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
      process.env.RATE_CONTACT_EMAIL,
      'RATE_CONTACT_EMAIL',
      'contactEmailWindowMs',
      'contactEmailMax',
    ),
    ...rateLimitFields(
      process.env.RATE_AUTH_REFRESH,
      'RATE_AUTH_REFRESH',
      'authRefreshWindowMs',
      'authRefreshMax',
    ),
    ...rateLimitFields(process.env.RATE_VOUCHER, 'RATE_VOUCHER', 'voucherWindowMs', 'voucherMax'),
    ...rateLimitFields(process.env.RATE_CHECKOUT, 'RATE_CHECKOUT', 'checkoutWindowMs', 'checkoutMax'),
    ...rateLimitFields(process.env.RATE_PAYMENT, 'RATE_PAYMENT', 'paymentWindowMs', 'paymentMax'),
    ...rateLimitFields(process.env.RATE_GALLERY, 'RATE_GALLERY', 'galleryWindowMs', 'galleryMax'),
    ...rateLimitFields(process.env.RATE_OPS, 'RATE_OPS', 'opsWindowMs', 'opsMax'),
    ...rateLimitFields(process.env.RATE_GIFT_PIN, 'RATE_GIFT_PIN', 'giftPinWindowMs', 'giftPinMax'),
    ...rateLimitFields(
      process.env.RATE_GIFT_CREATE_EMAIL,
      'RATE_GIFT_CREATE_EMAIL',
      'giftCreateEmailWindowMs',
      'giftCreateEmailMax',
    ),
    ...rateLimitFields(
      process.env.RATE_GIFT_SHARE_CARD_UPDATE,
      'RATE_GIFT_SHARE_CARD_UPDATE',
      'giftShareCardUpdateWindowMs',
      'giftShareCardUpdateMax',
    ),
    ...rateLimitFields(
      process.env.RATE_GIFT_SHARE_CARD_DOWNLOAD,
      'RATE_GIFT_SHARE_CARD_DOWNLOAD',
      'giftShareCardDownloadWindowMs',
      'giftShareCardDownloadMax',
    ),
    ...rateLimitFields(
      process.env.RATE_GIFT_SHARE_CARD_EMAIL,
      'RATE_GIFT_SHARE_CARD_EMAIL',
      'giftShareCardEmailWindowMs',
      'giftShareCardEmailMax',
    ),
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
    disableContactEmail: isDevelopment && process.env.DISABLE_RATE_CONTACT_EMAIL === 'true',
    disableGiftCreateEmail: isDevelopment && process.env.DISABLE_RATE_GIFT_CREATE_EMAIL === 'true',
    disableGiftShareCardUpdate: isDevelopment && process.env.DISABLE_RATE_GIFT_SHARE_CARD_UPDATE === 'true',
    disableGiftShareCardDownload:
      isDevelopment && process.env.DISABLE_RATE_GIFT_SHARE_CARD_DOWNLOAD === 'true',
    disableGiftShareCardEmail: isDevelopment && process.env.DISABLE_RATE_GIFT_SHARE_CARD_EMAIL === 'true',
    disableInvoiceDownload: isDevelopment && process.env.DISABLE_RATE_INVOICE_DOWNLOAD === 'true',
    disableInvoiceEmail: isDevelopment && process.env.DISABLE_RATE_INVOICE_EMAIL === 'true',
    disableAuthRefresh: isDevelopment && process.env.DISABLE_RATE_AUTH_REFRESH === 'true',
    disableVoucher: isDevelopment && process.env.DISABLE_RATE_VOUCHER === 'true',
    disableCheckout: isDevelopment && process.env.DISABLE_RATE_CHECKOUT === 'true',
    disablePayment: isDevelopment && process.env.DISABLE_RATE_PAYMENT === 'true',
    disableGallery: isDevelopment && process.env.DISABLE_RATE_GALLERY === 'true',
    disableOps: isDevelopment && process.env.DISABLE_RATE_OPS === 'true',
    disableLogin: isDevelopment && process.env.DISABLE_RATE_LOGIN === 'true',
    disableGiftPin: isDevelopment && process.env.DISABLE_RATE_GIFT_PIN === 'true',
    spyCooldownMs: requiredDurationMs(process.env.RATE_LIMIT_SPY_COOLDOWN, 'RATE_LIMIT_SPY_COOLDOWN'),
    sendVolumeSpyDay: requiredPositiveInteger(process.env.SEND_VOLUME_SPY_DAY, 'SEND_VOLUME_SPY_DAY'),
    disableSpyCooldown: isDevelopment && process.env.DISABLE_RATE_LIMIT_SPY_COOLDOWN === 'true',
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
  paymentAuthExpirySpyBeforeMs: optionalDurationMs(
    process.env.PAYMENT_AUTH_EXPIRY_SPY_BEFORE,
    '2d',
    'PAYMENT_AUTH_EXPIRY_SPY_BEFORE',
  ),
  loyalty: {
    valuePer100: requiredNumberInRange(process.env.LOYALTY_VALUE_PER_100, 'LOYALTY_VALUE_PER_100', 0, 10_000),
    lotDurationMonths: requiredLotDurationMonths(
      process.env.LOYALTY_LOT_DURATION_MONTHS,
      'LOYALTY_LOT_DURATION_MONTHS',
    ),
    burnNoticeWeeks: requiredIntegerInRange(
      process.env.LOYALTY_BURN_NOTICE_WEEKS,
      'LOYALTY_BURN_NOTICE_WEEKS',
      1,
      520,
    ),
    reminderIntervalDays: requiredIntegerInRange(
      process.env.LOYALTY_REMINDER_INTERVAL_DAYS,
      'LOYALTY_REMINDER_INTERVAL_DAYS',
      1,
      90,
    ),
  },
  gift: {
    receiverTokenTtlDays: requiredIntegerInRange(
      process.env.GIFT_RECEIVER_TOKEN_TTL_DAYS,
      'GIFT_RECEIVER_TOKEN_TTL_DAYS',
      1,
      365,
    ),
    extendCeilingDays: requiredIntegerInRange(
      process.env.GIFT_EXTEND_CEILING_DAYS,
      'GIFT_EXTEND_CEILING_DAYS',
      1,
      365,
    ),
    lockSessionTtlHours: requiredIntegerInRange(
      process.env.GIFT_LOCK_SESSION_TTL_HOURS,
      'GIFT_LOCK_SESSION_TTL_HOURS',
      1,
      24,
    ),
    stockHoldTtlDays: requiredIntegerInRange(
      process.env.GIFT_STOCK_HOLD_TTL_DAYS,
      'GIFT_STOCK_HOLD_TTL_DAYS',
      1,
      30,
    ),
    giverPayTtlDays: requiredIntegerInRange(
      process.env.GIFT_GIVER_PAY_TTL_DAYS,
      'GIFT_GIVER_PAY_TTL_DAYS',
      1,
      90,
    ),
    selectReminderBeforeMs: requiredDurationMs(
      process.env.GIFT_SELECT_REMINDER_BEFORE,
      'GIFT_SELECT_REMINDER_BEFORE',
    ),
    holdReminderBeforeMs: requiredDurationMs(
      process.env.GIFT_HOLD_REMINDER_BEFORE,
      'GIFT_HOLD_REMINDER_BEFORE',
    ),
    payReminderBeforeMs: requiredDurationMs(process.env.GIFT_PAY_REMINDER_BEFORE, 'GIFT_PAY_REMINDER_BEFORE'),
    visibilityAfterTerminalDays: requiredIntegerInRange(
      process.env.GIFT_VISIBILITY_AFTER_TERMINAL_DAYS,
      'GIFT_VISIBILITY_AFTER_TERMINAL_DAYS',
      1,
      90,
    ),
    minBudget: giftMinBudget,
    maxBudgetCeiling: giftMaxBudgetCeiling,
    maxAccessoryBudgetCeiling: requiredNumberInRange(
      process.env.GIFT_MAX_ACCESSORY_BUDGET_CEILING,
      'GIFT_MAX_ACCESSORY_BUDGET_CEILING',
      1,
      9999.99,
    ),
    maxOpenPromisesPerGiver: requiredIntegerInRange(
      process.env.GIFT_MAX_OPEN_PROMISES_PER_GIVER,
      'GIFT_MAX_OPEN_PROMISES_PER_GIVER',
      1,
      100,
    ),
    ...(([pinFreeFailures, pinMaxFailures]) => ({ pinFreeFailures, pinMaxFailures }))(
      requiredIntegerPair(process.env.GIFT_PIN_FAILURES, 'GIFT_PIN_FAILURES', [1, 20], [1, 100]),
    ),
    purgeAfterDays: requiredIntegerInRange(
      process.env.GIFT_PURGE_AFTER_DAYS,
      'GIFT_PURGE_AFTER_DAYS',
      30,
      1095,
    ),
  },
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
  /** Days to keep a one-time (non-remembered) Stripe card attached after
   * the order reaches `received`, or after `cancelled` when it never did —
   * see cardRetention.service.ts. */
  oneTimeCardRetentionDays: requiredPositiveInteger(
    process.env.ONE_TIME_CARD_RETENTION_DAYS,
    'ONE_TIME_CARD_RETENTION_DAYS',
  ),
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
  contactRecipientEmail: process.env.EMAIL_CONTACT_RECIPIENT?.trim() || undefined,
  requestSmtpUser: process.env.SMTP_REQUEST_USER?.trim() || undefined,
  requestRecipientEmail: process.env.EMAIL_REQUEST_RECIPIENT?.trim() || undefined,
  orderSpyRecipientEmail: process.env.EMAIL_ORDER_SPY_RECIPIENT?.trim() || undefined,
  disableSpyEmail: process.env.DISABLE_SPY_EMAIL === 'true',
  chatSmtp: {
    // Optional everywhere: account chat itself remains available. Missing SMTP
    // only prevents owner email-pipe delivery and customer notifications.
    host: process.env.SMTP_CHAT_HOST?.trim() || undefined,
    port: (() => {
      const raw = process.env.SMTP_CHAT_PORT?.trim();
      if (!raw) return undefined;
      const number = Number(raw);
      if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error(`Invalid positive integer environment variable SMTP_CHAT_PORT: "${raw}".`);
      }
      return number;
    })(),
    user: process.env.SMTP_CHAT_USER?.trim() || undefined,
    password: process.env.SMTP_CHAT_PASSWORD?.trim() || undefined,
    fromEmail: process.env.EMAIL_CHAT_FROM?.trim() || undefined,
    recipientEmail: process.env.EMAIL_CHAT_RECIPIENT?.trim() || undefined,
  },
  chatMaxSessionsPerUser: requiredPositiveInteger(
    process.env.CHAT_MAX_SESSIONS_PER_USER,
    'CHAT_MAX_SESSIONS_PER_USER',
  ),
  adminChatOwnerEmailSuppressionTimeoutMs: optionalDurationMs(
    process.env.ADMIN_CHAT_OWNER_EMAIL_SUPPRESSION_TIMEOUT,
    '10m',
    'ADMIN_CHAT_OWNER_EMAIL_SUPPRESSION_TIMEOUT',
  ),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || undefined,
    signupTokenTtlMs: optionalDurationMs(
      process.env.GOOGLE_SIGNUP_TOKEN_TTL,
      '10m',
      'GOOGLE_SIGNUP_TOKEN_TTL',
    ),
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID?.trim() || undefined,
    appSecret: process.env.FACEBOOK_APP_SECRET?.trim() || undefined,
    signupTokenTtlMs: optionalDurationMs(
      process.env.FACEBOOK_SIGNUP_TOKEN_TTL,
      '10m',
      'FACEBOOK_SIGNUP_TOKEN_TTL',
    ),
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID?.trim() || undefined, // Services ID
    teamId: process.env.APPLE_TEAM_ID?.trim() || undefined,
    keyId: process.env.APPLE_KEY_ID?.trim() || undefined,
    privateKey: loadApplePrivateKeyFromFile(process.env.APPLE_KEY_ID, targetFileSuffix),
    signupTokenTtlMs: optionalDurationMs(process.env.APPLE_SIGNUP_TOKEN_TTL, '10m', 'APPLE_SIGNUP_TOKEN_TTL'),
    s2sAudience: process.env.APPLE_S2S_AUDIENCE?.trim() || undefined,
  },
  frontendBaseUrl: required(
    process.env.PAM_TEST_FRONTEND_BASE_URL ?? process.env.URL_FRONTEND_BASE,
    'URL_FRONTEND_BASE',
  ),
  company: {
    name: required(process.env.COMPANY_NAME, 'COMPANY_NAME'),
    status: required(process.env.COMPANY_STATUS, 'COMPANY_STATUS'),
    siren: required(process.env.COMPANY_SIREN, 'COMPANY_SIREN'),
    address: required(process.env.COMPANY_ADDRESS, 'COMPANY_ADDRESS'),
    vatMention: required(process.env.COMPANY_VAT_MENTION, 'COMPANY_VAT_MENTION'),
    phone: process.env.COMPANY_PHONE?.trim() || undefined,
    email: required(process.env.COMPANY_EMAIL, 'COMPANY_EMAIL'),
  },
  stripe: {
    secretKey: optionalUnlessDeployed(process.env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY', isDevelopment),
    webhookSecret: optionalUnlessDeployed(
      process.env.PAM_TEST_STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET,
      'STRIPE_WEBHOOK_SECRET',
      isDevelopment,
    ),
    timeoutMs: optionalDurationMs(process.env.STRIPE_REQUEST_TIMEOUT, '12s', 'STRIPE_REQUEST_TIMEOUT'),
  },
  mondialRelay: {
    api2Url: process.env.MONDIAL_RELAY_API2_URL,
    api2Enseigne: process.env.MONDIAL_RELAY_API2_ENSEIGNE,
    api2Login: process.env.MONDIAL_RELAY_API2_LOGIN,
    api2Password: process.env.MONDIAL_RELAY_API2_PASSWORD,
    pointCourierCode: process.env.MONDIAL_RELAY_POINT_COURIER_CODE,
    pointNetworkCode: process.env.MONDIAL_RELAY_POINT_NETWORK_CODE,
    pointDeliveryMode: process.env.MONDIAL_RELAY_POINT_DELIVERY_MODE,
    homeCourierCode: process.env.MONDIAL_RELAY_HOME_COURIER_CODE,
    homeNetworkCode: process.env.MONDIAL_RELAY_HOME_NETWORK_CODE,
    homeDeliveryMode: process.env.MONDIAL_RELAY_HOME_DELIVERY_MODE,
    homeCollectionMode: process.env.MONDIAL_RELAY_HOME_COLLECTION_MODE,
    collectionMode: process.env.MONDIAL_RELAY_COLLECTION_MODE,
    senderName: process.env.MONDIAL_RELAY_SENDER_NAME,
    senderLine1: process.env.MONDIAL_RELAY_SENDER_LINE1,
    senderPostalCode: process.env.MONDIAL_RELAY_SENDER_POSTAL_CODE,
    senderCity: process.env.MONDIAL_RELAY_SENDER_CITY,
    senderCountryCode: process.env.MONDIAL_RELAY_SENDER_COUNTRY_CODE,
    senderPhone: process.env.MONDIAL_RELAY_SENDER_PHONE,
    senderEmail: process.env.MONDIAL_RELAY_SENDER_EMAIL,
    api1Url: process.env.MONDIAL_RELAY_API1_URL,
    api1Enseigne: process.env.MONDIAL_RELAY_API1_ENSEIGNE,
    api1PrivateKey: process.env.MONDIAL_RELAY_API1_PRIVATE_KEY,
    publicTrackingUrl: process.env.MONDIAL_RELAY_PUBLIC_TRACKING_URL,
    trackingThrottleMs: optionalDurationMs(
      process.env.MONDIAL_RELAY_TRACKING_THROTTLE,
      '1.5s',
      'MONDIAL_RELAY_TRACKING_THROTTLE',
    ),
    trackingTimeoutMs: optionalDurationMs(
      process.env.MONDIAL_RELAY_TRACKING_TIMEOUT,
      '30s',
      'MONDIAL_RELAY_TRACKING_TIMEOUT',
    ),
  },
};
