# Courier logos

Drop one image per courier here, named exactly after its **courier code**
(the same code the API returns in `GET /couriers`, e.g. `mondial-relay.svg`).
`.svg`, `.png`, `.webp` and `.jpg` are picked up automatically — no code
change, no import to add: `../courierLogos.ts` globs this folder.

Couriers are server/env-configured, so a missing file is a normal state, not
a bug: `CourierLogo` falls back to the two-letter initials badge
(`utils/courierBadge.ts`) for any courier without an image here.

Prefer a square-ish, transparent-background asset — logos are rendered inside
a small rounded box (28–36px) with `object-fit: contain`.
