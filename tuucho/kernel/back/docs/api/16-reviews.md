# Vinted reviews and rating

The home page "Ce qu'en pensent les clientes" block shows up to three real
reviews taken from the shop's public Vinted profile. An administrator
retrieves candidates on demand, then chooses which ones to show. Nothing runs
on a schedule.

Only the chosen reviews are stored (three at most). Scraped candidates are
never written to the database: they live in the administration page, each
carrying a server signature that proves it came from this server's scrape.

Storage: [`vinted_reviews`](../schema/10-reviews.md).

## How a scrape reads Vinted

- Read-only, signed out, no Vinted credentials. Vinted's home page
  (`https://www.vinted.<tld>/`) hands out an anonymous session cookie, which
  the feedback JSON endpoint (`/api/v2/user_feedbacks`) requires.
- Paced like a person browsing: one Vinted request at a time for the whole
  process, with a random pause of 1.2 to 2.8 s between two requests. The
  anonymous session is reused for 20 minutes and its cookies are kept up to
  date from every response, like a browser's cookie jar. Requests carry the
  headers a browser sends for the same page (user agent, `Accept`,
  `Accept-Language`, `Referer`). A `401`/`403` drops the session.
- Feedback pages are read 20 at a time, newest first, until `count` buyer
  written reviews are found, the profile has no more, 6 pages were read, or
  the deadline passed after the first page (what was found is kept).
- Automatic feedback is discarded and never counts: Vinted's
  `system_feedback: true`, or text starting with `Évaluation automatique`,
  `Auto-feedback` or `Automatic feedback`.
- Locations are not part of the scrape: the administration page then asks
  `POST /admin/vinted-reviews/locate` for each candidate, one after the
  other, and stops at the first refusal. Each reads the reviewer's public
  member page (`/member/<id>`). As on Vinted's own profile page, a member who
  hides their location (`expose_location: false`) shows only their country.
- Bounds: 8 s per Vinted request, 25 s per admin request (under the front's
  30 s request timeout), 2 MB per JSON body, 4 MB per member page, one review
  or rating scrape at a time per process.

## Public

### `GET /reviews`

No authentication. Mounted with the gallery routes (same CORS and rate
limit). Feeds both the home page reviews block and the hero rating.

`Cache-Control`:

- `public, max-age=<HOME_REVIEWS_CACHE_TTL>` when the environment sets
  `HOME_REVIEWS_CACHE_TTL` (a duration such as `14d`, set on prod) **and** the
  answer is complete: at least one review and a rating. A returning visitor
  then keeps their copy that long, so an administration change reaches them
  only when it expires.
- `no-cache` otherwise: the variable unset (dev, preprod), or an incomplete
  answer (no review or no rating). The browser revalidates on every load
  (ETag, `304` when unchanged), so an empty answer is never kept and a value
  chosen later shows at once.

Response `200`:

```json
{
  "success": true,
  "reviews": [
    {
      "id": "4452366795",
      "text": "Parfait merci beaucoup !",
      "rating": 5,
      "author": "nsk_d3sign",
      "city": "Châteaubriant",
      "countryCode": "FR",
      "reviewedAt": "2026-09-25T13:28:17.000Z",
      "sourceLang": "fr",
      "translations": { "en": "Perfect, thank you very much!", "es": "...", "it": "...", "nl": "...", "pt": "...", "th": "..." }
    }
  ],
  "rating": { "rating": "5.0", "reviewCount": 107 }
}
```

At most three, the most recently chosen first. Empty when none is chosen; the
front then hides the block. `id` is Vinted's feedback id as a string.
`author` is the reviewer's public Vinted login. `city` and `countryCode` may be
null. The text is shown as written on Vinted, in its original language.

`text` is always the original. `sourceLang` is its language: the language of
the Vinted storefront it was read from (`fr` for www.vinted.fr; null when the
site does not offer it). `translations` maps each other site language to a
machine translation (MyMemory), filled language by language; a missing
language shows the original. All languages come in one answer, so the
front switches language without a new request and the cache does not depend
on the visitor's language. The front shows the translation for the visitor's
language with a link to the original, and the original with a link back.

`rating` is the shop's Vinted rating last applied in the administration, or
null when none was ever applied (the hero then shows no rating).

## Administration

`requireAuth` + `requireAdmin` on every route. Each change is written to the
administration journal (category `settings`, actions
`reviews.vinted.scrape`, `reviews.vinted.feature`, `reviews.vinted.unfeature`,
`reviews.vinted.rating`). `GET /admin/vinted-reviews` also returns `rating`
(the applied rating with `updatedAt`, or null).

`Review` below is the public shape plus `featuredAt` (ISO string, when it
was chosen). `Candidate` is the public shape plus `token`.

### `GET /admin/vinted-reviews`

`Cache-Control: private, no-store`.

Response `200`: `{ success, featured: Review[] }`, what the home page shows
(newest choice first, max 3). Candidates are not listed: they are not stored,
so a reload of the administration page drops them.

### `POST /admin/vinted-reviews/scrape`

Body:

| Field        | Type   | Rules                                                                                                                                                      |
| ------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profileUrl` | string | `https://www.vinted.<tld>/member/<numeric id>` (optional `-login`, query, trailing slash). Any other host, scheme, port or credentials: `400`. The server only ever calls that Vinted origin. |
| `count`      | int    | Real reviews wanted, `1` to `30`, default `5`. Automatic feedback does not count.                                                                         |

The front sends its `VITE_SHOP_VINTED_URL`.

Nothing is written to the database. `candidates` lists every buyer-written
review in Vinted's order (newest first), only automatic feedback removed,
including reviews already shown on the home page (choosing one again moves it
to the top).

Each candidate's `token` is a JWT (HS256, the API's `JWT_SECRET`, audience
`tuucho-vinted-review`, valid 24 h) whose payload is the review exactly as
scraped. It is not a credential: it only lets
`POST /admin/vinted-reviews/featured` store that review without trusting text
sent by the browser.

Response `200`:

```json
{
  "success": true,
  "candidates": [Candidate],
  "exhausted": false,
  "automaticDiscarded": 11
}
```

`exhausted: true` when fewer than `count` were found (the profile has no more,
the page cap, or the time limit). Candidates have `city` and `countryCode`
null until located.

Errors:

| Status | Code                 | When                                                                                 |
| ------ | -------------------- | ------------------------------------------------------------------------------------ |
| 400    | `invalid_request`    | Bad `profileUrl` or `count`.                                                         |
| 409    | `scrape_in_progress` | Another scrape is running.                                                           |
| 502    | `vinted_unavailable` | Vinted refused or broke a request (anti-bot block, 4xx/5xx, unexpected shape). `error.reason` is a short diagnostic such as `feedbacks_403`. |
| 504    | `vinted_timeout`     | The 25 s deadline passed before the reviews were read. Reaching it while reading locations is not an error: the reviews are returned, the rest of the locations stay empty. |

### `POST /admin/vinted-reviews/locate`

Body: `{ "profileUrl": "...", "token": "<candidate token>" }`.

Reads the reviewer's public member page (one paced Vinted request) and returns
the candidate with its location and a new `token` covering it:
`{ success, candidate: Candidate }`. Nothing is stored.

Errors: `400 invalid_request`, `400 invalid_review_token`,
`502 vinted_unavailable` (with `reason`, for example `member_403`),
`504 vinted_timeout`. The candidate stays usable without location.

### `POST /admin/vinted-reviews/featured`

Body: `{ "tokens": ["<candidate token>"] }`, 1 to 3 tokens of distinct
reviews, from a scrape less than 24 h old.

Each token is verified, then the chosen reviews are stored and become the
newest featured reviews, in the order sent. The previously featured ones
follow, and the oldest beyond three are deleted. Concurrent calls are
serialized. Nothing is translated here (see **Translation** below); a
translation already stored for a re-chosen review is kept.

Response `200`: `{ success, featured: Review[], untranslated: string[] }`
(`untranslated`: ids of chosen reviews without any translation yet).
Errors: `400 invalid_request` (shape, count, or the same review twice),
`400 invalid_review_token` (bad signature, expired, or malformed payload).

### `POST /admin/vinted-reviews/featured/:feedbackId/translate`

Body: `{ "lang": "en" }`, a site language other than the review's own.
Translates one featured review into that language and stores it next to the
others (journal action `reviews.vinted.translate`).
Response `200`: `{ success, review: Review }`.
Errors: `400 invalid_request` (bad id, unknown language, or the review's own
language), `404 not_found`, `502 translation_unavailable` with `reason`:
`source_unknown` (review language unknown), `quota` (daily free limit
reached), `timeout`, `network`, or `status_<n>`.

### Translation

- Provider: MyMemory (`api.mymemory.translated.net`), free public machine
  translation: no key, no account, 5,000 characters a day for anonymous use.
  Codes: `fr`, `en-GB`, `es`, `it`, `nl`, `pt-PT`, `th`.
- Vinted gives no language per review: a review is taken to be in its
  storefront's language, signed into the candidate at scrape time.
- Only chosen reviews are translated, never on a page view, never a scraped
  candidate. The administration page translates each new review into each
  other language, one request at a time, and stops at the first failure; a
  language left out can be translated again later.
- Paced like a person using it: one MyMemory request at a time for the whole
  process, with a random pause of 0.7 to 1.5 s between two. A text over 450
  bytes is sent in sentence-sized pieces (MyMemory takes at most 500 bytes).
- Bounds: 8 s per MyMemory request, 25 s per admin request, 256 KB per
  response. No transaction is open while MyMemory is called. Tests never call
  MyMemory.

### `DELETE /admin/vinted-reviews/featured/:feedbackId`

Removes one review from the home page and deletes it. A new scrape can list
it again.

Response `200`: `{ success: true }`. Errors: `400 invalid_request`,
`404 not_found` (not currently featured).

### `POST /admin/vinted-reviews/rating/scrape`

Body: `{ "profileUrl": "..." }` (same rules as the review scrape).

Reads the shop's own member page and returns its rating. Nothing is stored:
the admin compares it with the current value and applies it, or not.
`rating` is Vinted's `feedback_reputation` (0 to 1) × 5, one decimal;
`reviewCount` is its `feedback_count`.

Response `200`:

```json
{
  "success": true,
  "scraped": { "rating": "5.0", "reviewCount": 107, "token": "<jwt>" },
  "current": { "rating": "4.9", "reviewCount": 98, "updatedAt": "2026-10-06T08:00:00.000Z" }
}
```

`current` is null when none was applied. `token`: JWT like a review candidate's,
audience `tuucho-vinted-rating`, valid 24 h.

Errors: same as the review scrape (`400`, `409 scrape_in_progress`,
`502 vinted_unavailable` with `reason` `rating_not_found` when the page has no
rating, `504 vinted_timeout`).

### `PUT /admin/vinted-reviews/rating`

Body: `{ "token": "<scraped.token>" }`. Stores that rating for the home page
(journal action `reviews.vinted.rating`).

Response `200`: `{ success, rating: { rating, reviewCount, updatedAt } }`.
Errors: `400 invalid_request`, `400 invalid_review_token` (bad signature,
expired, or a review token instead of a rating token).
