# Config architecture

Checkout: `/home/tezov/Local/tuucho-ecom`. Git **read-only** (no commit, no push, no GitHub). Do not steal Vite **5174**.

JSON/DB is the product. Kernel JSON is machine + kernel policy only. Plugin settings in DB (`settingsSchema`); plugin secrets in the secret store. Kernel openings: `getPluginSettings` / `getPluginSecret`. Kernel must not name plugin keys in `config/`, loader maps, leftover `.env`, README, setup, doctor, or skills.

This pass: **plugin isolation** + **leftover env deletion**. Nothing “later”.

---

## Locked layout (folder merge unchanged)

Files live under `kernel/back/config/`.

| Layer | Path | Git |
| --- | --- | --- |
| Common public | `config/config.json` | committed |
| Common private | `config/config.private.json` | gitignored |
| Common private example | `config/config.private.example.json` | committed, functional |
| Env public | `config/<environment>/config.json` | committed |
| Env private | `config/<environment>/config.private.json` | gitignored |
| Env private example | `config/<environment>/config.private.example.json` | committed, functional |

This checkout ships **only** `config/` common files plus `config/dev/`. Do **not** create `config/preprod/` or `config/prod/` as product files.

`APP_TARGET` is the folder name. Local default **`dev`**. Missing folder → **error naming it** (list folders that exist). Any name is allowed **if the folder exists**.

SEO indexing stays `APP_TARGET===prod` when that folder exists. Not a JSON flag.

### Merge (top → bottom, bottom wins)

1. Common public `config/config.json`
2. Env public `config/<APP_TARGET>/config.json`
3. Common private (or `*.example`)
4. Env private (or `*.example`)
5. Process leftover overlay only: `APP_TARGET`, `PORT` / `APP_PORT`, optional host `DATABASE_URL` (cannot replace a missing private file)

Required private paths (merged private): `database.url`, `jwt.secret`, `pii.encryptionKey`, `pii.lookupPepper`, `ops.token`.

---

## Who supplies config

### Kernel (`kernel/back/config/`, common + `config/dev/` only)

Vocabulary only: **http**, **paths**, **database**, **session**, **smtp shell** (no-reply), **security**, **logs**.

Kernel JSON must not contain gift, loyalty, Stripe, Mondial, contact recipients, spy channels, shop SIRET/copy, courier brands, payment keys, chat SMTP, product-request mailboxes, review cache TTL, voucher/gift/contact rate knobs, Facebook/Google/Apple OAuth knobs, or other plugin product knobs.

Sign-in **tiers** (session, OTP, unlock, Preferences enable) stay the kernel shell. Live providers register on `core.signIn.methods` and store credentials on `tuucho-signin-<provider>` (`settingsSchema` / secrets). Kernel identity reads via `getCachedPluginSettings` / `getCachedPluginSecret` using that plugin-id convention — no `config.auth.facebook*`.

Optional kernel private for **ops/deploy** (not plugins): `ftp.host` / `ftp.user` / `ftp.password`, `ops.gatewayUrl`.

### Plugins

Each plugin supplies its own config:

- **Public:** `tuucho.defaultSettings` + `tuucho.settingsSchema` (Admin Configure). Public `plugins.settings` JSONB stays plaintext (publishable keys, URLs, TTLs).
- **Secrets:** `settingsSchema` `type: "secret"` → plugin secret store (`getPluginSecret` / `getCachedPluginSecret`).
- **Secrets at rest:** `plugins.secrets` JSONB is **never plaintext**. The whole map is sealed with the kernel PII helper (`encryptJsonPii` / `encryptPii`, AES-256-GCM, `pii.encryptionKey`, `v1:` prefix) and stored as a JSONB string. Reads go through decrypt. Writes replace the sealed document (no `jsonb ||` merge). Leftover plaintext rows are sealed on `listPlugins` (boot). Empty stays `{}`. Admin Configure returns `secretKeys` names only, never values.
- **Files** only if a plugin truly needs them: same public/private/`*.example` rules **inside that plugin**, never in kernel `config/`.

Kernel may read a plugin’s document via openings (`getCachedPluginSettings` / `getPluginSecret`) the way `carrierSettings.ts` already reads Mondial. Kernel boot (`env.ts`) must not require those keys.

---

## Isolation table (key → owner)

JSON paths are the former kernel `config/` keys. Env names are leftover flatten names, deleted with this pass.

| Key (JSON / leftover env) | Owner |
| --- | --- |
| `http.port` / `APP_PORT` | kernel |
| `http.corsOrigins` / `CORS_ORIGIN` | kernel |
| `http.frontendBaseUrl` / `URL_FRONTEND_BASE` | kernel |
| `http.apiBaseUrl` / `URL_API_BASE` | kernel |
| `http.publicMediaUrl` / `URL_PUBLIC_MEDIA` | kernel |
| `http.smallPhotoSize` / `SMALL_PHOTO_SIZE` | kernel |
| `http.contactImageMaxBytes` / `CONTACT_IMAGE_MAX_BYTES` | **tuucho-contact** |
| `http.chatImageMaxBytes` / `CHAT_IMAGE_MAX_BYTES` | **tuucho-contact** |
| `paths.publicDir` / `PUBLIC_DIR` | kernel |
| `paths.privateDir` / `PRIVATE_DIR` | kernel |
| `paths.devDir` / `DEV_DIR` | kernel |
| `paths.publicMediaDir` / `PUBLIC_MEDIA_DIR` | kernel |
| `paths.privateMediaContactDir` / `PRIVATE_MEDIA_CONTACT_DIR` | **tuucho-contact** |
| `paths.privateMediaChatDir` / `PRIVATE_MEDIA_CHAT_DIR` | **tuucho-contact** |
| `paths.privateInvoiceDir` / `PRIVATE_INVOICE_DIR` | kernel |
| `paths.privateShipmentLabelDir` / `PRIVATE_SHIPMENT_LABEL_DIR` | kernel |
| `paths.privateTestDir` / `PRIVATE_TEST_DIR` | kernel |
| `paths.privateBackupDir` / `PRIVATE_BACKUP_DIR` | kernel |
| `paths.logs.api` / `PRIVATE_LOG_API_FILE` | kernel |
| `paths.logs.email` / `PRIVATE_LOG_EMAIL_FILE` | kernel |
| `paths.logs.cronShipment` / `PRIVATE_LOG_CRON_SHIPMENT_FILE` | kernel |
| `paths.logs.cronAccountDeletion` / `PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE` | kernel |
| `paths.logs.cronGuestSavedCleanup` / `PRIVATE_LOG_CRON_GUEST_SAVED_CLEANUP_FILE` | kernel |
| `paths.logs.cronLoyalty` / `PRIVATE_LOG_CRON_LOYALTY_FILE` | **tuucho-commerce-loyalty** |
| `paths.logs.cronGift` / `PRIVATE_LOG_CRON_GIFT_FILE` | **tuucho-commerce-gift** |
| `paths.logs.cronGiftPurge` / `PRIVATE_LOG_CRON_GIFT_PURGE_FILE` | **tuucho-commerce-gift** |
| `paths.logs.cronPaymentAuthExpiry` / `PRIVATE_LOG_CRON_PAYMENT_AUTH_EXPIRY_FILE` | kernel |
| `paths.logs.cronWarm` / `PRIVATE_LOG_WARM_FILE` | kernel |
| `paths.logs.activity` / `PRIVATE_LOG_ACTIVITY_FILE` | kernel |
| `paths.devEmailUserDir` / `DEV_EMAIL_USER_DIR` | kernel (smtp shell dump) |
| `paths.devEmailSpyDir` / `DEV_EMAIL_SPY_DIR` | **tuucho-mail-spy** |
| `paths.devEmailChatDir` / `DEV_EMAIL_CHAT_DIR` | **tuucho-contact** |
| `database.*` / `DATABASE_*` `POSTGRES_*` | kernel |
| `session.*` / `JWT_*` TTLs | kernel |
| `jwt.secret` / `JWT_SECRET` | kernel |
| `ops.token` / `OPS_TOKEN` | kernel |
| `ops.gatewayUrl` / `OPS_GATEWAY_URL` | kernel (deploy) |
| `ftp.*` / `FTP_*` | kernel (deploy) |
| `pii.*` | kernel |
| `smtp.*` (no-reply host/user/password/from) | kernel |
| `security.*` except payment-auth spy / one-time card | kernel |
| `security.paymentAuthExpirySpyBefore` / `PAYMENT_AUTH_EXPIRY_SPY_BEFORE` | **tuucho-payment-stripe** |
| `security.oneTimeCardRetentionDays` / `ONE_TIME_CARD_RETENTION_DAYS` | **tuucho-payment-stripe** |
| `fieldLimits.contactIdentityMax` / `FIELD_CONTACT_IDENTITY_MAX` | **tuucho-contact** |
| `fieldLimits.contactMessageMax` / `FIELD_CONTACT_MESSAGE_MAX` | **tuucho-contact** |
| `fieldLimits.productRequestCommentMax` / `FIELD_PRODUCT_REQUEST_COMMENT_MAX` | **tuucho-commerce-product-requests** |
| `fieldLimits.voucherCodeMax` / `FIELD_VOUCHER_CODE_MAX` | **tuucho-commerce-vouchers** |
| other `fieldLimits.*` (address, cart, pickup, token, gallery) | kernel |
| `rateLimits.contactEmail` + disable / `RATE_CONTACT_EMAIL` | **tuucho-contact** |
| `rateLimits.voucher` + disable / `RATE_VOUCHER` | **tuucho-commerce-vouchers** |
| `rateLimits.gift*` + disable / `RATE_GIFT_*` | **tuucho-commerce-gift** |
| `rateLimits` auth/checkout/payment/gallery/ops/invoice + disables | kernel |
| `spy.*` / `RATE_LIMIT_SPY_*` `SEND_VOLUME_SPY_DAY` `DISABLE_SPY_EMAIL` `EMAIL_*_RECIPIENT` | **tuucho-mail-spy** |
| `gift.*` / `GIFT_*` | **tuucho-commerce-gift** |
| `loyalty.*` / `LOYALTY_*` | **tuucho-commerce-loyalty** |
| `chat.*` / `CHAT_*` `SMTP_CHAT_*` `EMAIL_CHAT_*` | **tuucho-contact** |
| `request.*` / `SMTP_REQUEST_USER` `EMAIL_REQUEST_RECIPIENT` | **tuucho-commerce-product-requests** |
| `reviews.homeCacheTtl` / `HOME_REVIEWS_CACHE_TTL` | **tuucho-commerce-vinted-review** |
| `cron.shipment` / `ENABLED_CRON_SHIPMENT` | **tuucho-shipping-expedition-cron** (plugin enable) |
| Stripe publishable/secret/webhook | **tuucho-payment-stripe** (publishable in `plugins.settings`; secret/webhook sealed in `plugins.secrets`) |
| Mondial brand/API/sender/secrets | **tuucho-shipping-mondial-relay** (brand/URLs in `plugins.settings`; API login/password/keys sealed in `plugins.secrets`) |
| Shop SIRET/copy / `COMPANY_*` | store identity (`app_preferences.store.identity`) |
| `auth.facebookOauthReturnUrl` / `VITE_FACEBOOK_OAUTH_RETURN_URL` | **tuucho-signin-facebook** `oauthReturnUrl` |
| `auth.facebookAppId` / `FACEBOOK_APP_ID` | **tuucho-signin-facebook** `appId` |
| `auth.facebookAppSecret` / `FACEBOOK_APP_SECRET` | **tuucho-signin-facebook** `appSecret` (sealed) |
| `auth.facebookSignupTokenTtl` / `FACEBOOK_SIGNUP_TOKEN_TTL` | **tuucho-signin-facebook** `signupTokenTtl` |
| `auth.googleClientId` / `GOOGLE_CLIENT_ID` | **tuucho-signin-google** `clientId` |
| `auth.googleSignupTokenTtl` / `GOOGLE_SIGNUP_TOKEN_TTL` | **tuucho-signin-google** `signupTokenTtl` |
| `auth.appleClientId` / `APPLE_CLIENT_ID` | **tuucho-signin-apple** `clientId` |
| `auth.appleTeamId` / `APPLE_TEAM_ID` | **tuucho-signin-apple** `teamId` |
| `auth.appleKeyId` / `APPLE_KEY_ID` | **tuucho-signin-apple** `keyId` |
| `auth.appleS2sAudience` / `APPLE_S2S_AUDIENCE` | **tuucho-signin-apple** `s2sAudience` |
| `auth.appleSignupTokenTtl` / `APPLE_SIGNUP_TOKEN_TTL` | **tuucho-signin-apple** `signupTokenTtl` |
| `config/<env>/AuthKey_<KEY_ID>.p8` / Apple PEM | **tuucho-signin-apple** `privateKey` (sealed) |
| `VITE_GOOGLE_CLIENT_ID` `VITE_APPLE_CLIENT_ID` `VITE_APPLE_REDIRECT_URI` `VITE_FACEBOOK_APP_ID` | deleted; `/storefront/bootstrap` plugin settings |
| Front origins / `VITE_API_BASE_URL` `VITE_SITE_URL` | kernel `http.*` (Vite reads JSON; no front `.env` file) |

---

## Leftover env (delete after move)

Inventory on this checkout:

| File | Action |
| --- | --- |
| `kernel/back/.env/.private.env` | Deleted this pass. Keys already in kernel private JSON or plugin/identity. |
| `kernel/back/.env/dev/.private.env` | Deleted this pass. Same. |
| `kernel/front/.env/dev/.public.env` | Deleted this pass. Origins from kernel `http.*`; Facebook return from **tuucho-signin-facebook**. |
| `kernel/back/.compose.env` | Generated adapter for Docker Compose (`POSTGRES_*` from private JSON). Not operator-edited product env. Keep generating; stop compose/deploy from reading `.env/*.private.env`. |
| `sample/seed-defaults.env` | Seed **fixture** for import scripts (`CART_RULE_*`, payment-method/sign-in defaults). Not process env. Keep as seed fixture; not leftover runtime env. |
| `.lws.env` | None on disk. Deploy must SetEnv **only** leftover process keys (`APP_TARGET`, optional `PORT` / `DATABASE_URL`), never a product `.lws.env` file. |

Process leftover only: `APP_TARGET`, `PORT` / `APP_PORT`, optional host `DATABASE_URL`. Nothing else stays as product env. Do not tell people to edit `.private.env`.

---

## Boot / doctor / README

Unchanged folder rules. Doctor lists env folders under `config/`. README: copy `config/dev/` public + `*.example` to add an environment. No README.todo.

Isolation must not regress: no `MONDIAL_RELAY_` / `STRIPE_SECRET` / `STRIPE_WEBHOOK` / `FACEBOOK_` / `GOOGLE_CLIENT` / `APPLE_CLIENT` in kernel source maps; `/storefront/bootstrap` strips `type: "secret"`; no `VITE_` shop/plugin keys as product env.

---

## Database secrets at rest

`plugins.secrets` is sealed at rest (AES-256-GCM via `encryptJsonPii`, kernel `pii.encryptionKey`). Never persist plaintext JSONB for that column. Kernel private JSON files stay files (gitignored); this rule is **database** cleartext.

Customer PII columns already use the same helper — do not double-encrypt them. Password/OTP/session values stay hashes (`password_hash`, `token_hash`, `otp_hash`). Stripe `pm_` / `cus_` / `pi_` ids are object identifiers, not API secrets.

---

## Out of scope this run

Do not steal Vite **5174**. Do not print secret values. Checkout git remains read-only (no commit, no push, no GitHub). No pre-made `config/preprod/` or `config/prod/`.
