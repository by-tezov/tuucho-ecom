# Apple Pay domain association

Stripe requires this file at the shop apex:

`https://<shop>/.well-known/apple-developer-merchantid-domain-association`

This is a **website** Apple Pay integration through Stripe. You do **not**
need a Mac, Xcode, an iOS app, or a paid Apple Developer account. Stripe
holds the merchant certificates; Apple’s “Certificates / Merchant ID / add
application” screens are for native iOS apps only.

## Setup (once per Stripe account)

1. Stripe Dashboard → Payment methods → enable Apple Pay (test + live).
2. Payment method domains → register hosts
   (`localhost`, `preprod.pamsurin.fr`, `pamsurin.fr`) and verify.
3. Download the domain association file for your account.
4. Place it here as:

   `apple-developer-merchantid-domain-association`

   (no extension; exact Stripe filename).

5. Build + deploy. `scripts/version-dist.mjs` hoists `.well-known/` next to
   `current/` / `media/` so Apache serves it at the apex (not under `/current/`).
6. Confirm `https://<shop>/.well-known/apple-developer-merchantid-domain-association`
   returns 200 with no login wall.
7. In the admin dashboard, enable Apple Pay under Préférences → Moyens de
   paiement (shop flags default to off).
8. Test on Safari (iPhone or Mac) with a card in Wallet.

Register domains in the Dashboard (test: `localhost`, `preprod.pamsurin.fr`;
live: `pamsurin.fr`) and enable Google Pay + Apple Pay in test and live.
