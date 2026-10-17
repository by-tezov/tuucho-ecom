# Vinted reviews

Real buyer reviews read from the shop's public Vinted profile, for the home
page. Filled only by the admin scrape (see
[API: Vinted reviews](../api/16-reviews.md)); automatic Vinted feedback is
never stored.

## `vinted_reviews`

Holds only the reviews shown on the home page, three at most. Scraped
candidates are never stored (see the API doc: they travel signed through the
administration page).

| Column | Meaning |
| --- | --- |
| `feedback_id` | Vinted feedback id, primary key |
| `author_vinted_id` | Reviewer's Vinted member id |
| `author_login` | Reviewer's public Vinted login, shown as the name (1 to 80 chars) |
| `review_text` | Review as written on Vinted, trimmed (1 to 2000 chars) |
| `rating` | Stars, 1 to 5 |
| `city` / `country_code` | Reviewer's public location. `city` is null when they hide their location on Vinted (the country stays, as Vinted shows it); both are null when their page could not be read |
| `reviewed_at` | When the review was left on Vinted |
| `scraped_at` | When the row was written (or last re-chosen) |
| `source_lang` | The review's own language: its Vinted storefront's (site code such as `fr`); null when the site does not offer it |
| `translations` | `jsonb`, site language code to machine translation (MyMemory), added one language at a time; `{}` until translated. A re-choice never erases it |
| `featured_at` | When it was chosen; the home page shows the newest first. Nullable only for compatibility with the first deployed version, which also stored candidates; migration `1791700000000_vinted_reviews_featured_only` deleted those rows and the application no longer writes a null. |

Invariants:

- At most three rows. `POST /admin/vinted-reviews/featured` inserts the chosen
  reviews and deletes the oldest beyond three, under a transaction advisory
  lock that serializes concurrent choices.
- Retention: a row lives until an admin removes it (`DELETE`, which deletes
  the row) or a newer choice pushes it out (deleted too).
- Content is public on Vinted already: a login, a city, a review. No email,
  no Vinted credentials, no avatar.

## `vinted_rating`

The shop's star rating as its Vinted profile shows it, for the home page hero.
At most one row (`id` is always `true`).

| Column | Meaning |
| --- | --- |
| `id` | Always `true`: a single row |
| `rating` | Stars with one decimal (Vinted's `feedback_reputation` × 5) |
| `review_count` | Vinted's `feedback_count` when it was scraped |
| `updated_at` | When an admin applied it |

Written only by `PUT /admin/vinted-reviews/rating`, from a value this server
scraped and signed. Empty: the home page shows no rating at all.
