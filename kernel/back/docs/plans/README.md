# Design plans

Specifications for behaviour that is **not shipped**. These pages are the
implementation contract until the matching `docs/api/`, `docs/schema/`,
`docs/cron/`, and front-end land. They must not be read as live operator
docs.

In flight: [seo-coverage.md](./seo-coverage.md) — French-first SEO copy and
landing-page coverage across the three repos.

Planned: [nail-variations.md](./nail-variations.md), an optional per-nail
variation axis (colour first) for the compose-a-set single nails, across the
three repos. Follow-up draft: [nail-variation-copy.md](./nail-variation-copy.md),
each option as its own product (copy, colours, URL, SEO, share).
Draft: [variant-visibility.md](./variant-visibility.md), shapes and lengths
from the folders, `$` on every vocabulary key, hiding per shape or
shape/length (all three catalogues, admin included).

A plan is deleted once it ships, because a
shipped plan and the live docs then describe the same behaviour twice and
only one of the two gets updated.

What the last plans became:

| Shipped plan | Live docs |
| ------------ | --------- |
| Gift offers | [api/08-gift.md](../api/08-gift.md) · [schema/08-gift.md](../schema/08-gift.md) |
| Engineering passes (checkability, architecture tiers, the database boundary and the verification ladder) | [AGENTS.md](../../AGENTS.md) · [architecture/README.md](../architecture/README.md) · [command/04-test.md](../command/04-test.md) |
