---
name: tuucho-shop-delta
description: >-
  Writes or updates a shop release-delta file when a tuucho-ecom shop must
  alter a local kernel copy because stock openings are missing. Use when a
  shop forks tuucho, patches kernel/front/back/plugin-sdk locally, asks for a
  next-release deltas doc, or reports "cannot do X without changing tuucho".
  Produces actionable, agnostic gaps the product repo can turn into openings.
---

# Shop release deltas (kernel fork inventory)

## Purpose

A **delta file** lists what a **shop** could not do on a given official
tuucho-ecom tag without patching its local `tuucho/` (kernel, plugin-sdk,
factory-backup, or docs that belong to the product). Product maintainers use
that file to design **agnostic openings** in a later tag so shops stop
forking.

This skill writes or refreshes that file. It does **not** implement kernel
openings (use `tuucho-backend-change` / `tuucho-frontend-change` /
`tuucho-feature-new` in the product repo). It does **not** invent shop
plugins (use `tuucho-create-plugin` and children).

## When to use

- The shop edited files under `tuucho/kernel`, `tuucho/plugin-sdk`, or
  product-owned `tuucho/docs` / `tuucho/factory-backup` to ship a feature.
- The shop asks “what must the next tuucho tag open?” after a tag upgrade.
- An agent hits a missing opening and the only workaround would be a kernel
  patch; stop and record a delta item instead of patching (unless the user
  explicitly asked to fork).

## File location and name

Default in the **shop** repo (or a note attached to an upgrade PR):

- `tuucho-ecom-next-release-deltas.md` at the shop root, **or**
- `docs/tuucho-ecom-next-release-deltas.md` if the shop keeps product notes
  under `docs/`.

Title pattern:

```markdown
# tuucho-ecom deltas still required by <shop-id> (against <tag>)
```

`<shop-id>` is a short opaque id (folder name, brand slug). `<tag>` is the
exact product version the fork is based on (for example `0.0.7`), matching
root `package.json` / the applied tag. No `v` prefix.

One file per baseline tag. When the shop upgrades and re-audits, rewrite the
header against the new tag and mark closed items or move leftovers forward.

## Hard rules for a useful delta

1. **Against one official tag.** State the tag in the first paragraph. Do not
   mix “we also changed 0.0.5” without separating sections.
2. **Only product-tree forks.** Gaps that live entirely in `src/plugins/`,
   `tuucho-config/`, or shop deploy scripts are **not** deltas unless the
   shop had to change the kernel to make them work.
3. **Agnostic openings.** Propose APIs a *any* shop could use. Never propose
   hard-coding this shop’s languages, brand assets, SMTP passwords, or host
   tokens into the kernel.
4. **Paths and symbols.** Every item names concrete files or exports in the
   stock tag (and the shop fork if different). Prefer
   `npm --prefix tuucho/kernel/back run where -- <symbol>` / `--front` when
   available.
5. **Shop workaround, then opening.** For each fork: what stock does, what
   the shop changed locally, what product opening would remove the fork.
6. **No secrets.** Never paste private JSON, tokens, passwords, or live URLs
   with credentials. Name the *kind* of missing field (`type: "secret"` on a
   plugin, env key pattern) only.
7. **No dash characters in user-facing copy** inside examples that would
   ship to customers (same product hard rule). The delta file itself is
   operator-facing; still prefer plain ASCII hyphens in compound words.
8. **Do not “fix” the product in the shop.** The delta is the handoff. If
   the user wants the opening implemented, that work happens in the
   **product** checkout of tuucho-ecom, not by committing kernel patches in
   the shop as if they were upstream.

## Triage buckets

Sort every finding into exactly one bucket:

| Bucket | Meaning |
| --- | --- |
| **Forked (blocking)** | Shop carries a local kernel/sdk/docs patch today. Highest priority for the next product tag. |
| **Observed, not patched** | Stock behaviour is wrong or noisy (doctor false env, misleading log) but the shop did not fork for it. Still worth product fixing. |
| **Not a kernel opening** | Needs a plugin setting, shop config, or deploy-owned secret. Record so product does not invent a closed kernel field by mistake. |
| **Closed in `<newer-tag>`** | When refreshing after an upgrade: former fork items that the new tag opens. One line each; drop detail. |

## Per-item template (forked)

Copy this block for each **Forked** gap. Keep items numbered.

```markdown
## N. <short capability title>

Stock `<tag>` <what is closed or missing, with paths/symbols>.

What the shop copy does:
- <concrete local change: file, type widen, mount order, exposed API, …>
- <keep shop-specific values here as *examples*, not as the proposed API>

Opening that would remove the fork: <agnostic mechanism — registerX,
brandAssets key, commands surface, config normalize, mount order, filter
name, …>. Locale/catalog/plugin supply of *values* stays in the shop.
```

### What “opening that would remove the fork” must contain

Enough for a product agent to implement without knowing the shop:

- **Surface**: back registry, front context, bootstrap field, Vite build
  env, Express mount order, config parser, SDK `PluginRegisterApi`, …
- **Shape**: types or keys in generic terms (`code`, `nativeName`, absolute
  image URL, …), not this shop’s seven languages or CDN host.
- **Fallback**: what stock keeps doing when no plugin registers anything.
- **Non-goal**: what stays shop-owned (catalog strings, deploy FTP, host
  API tokens, theme pixels).

Bad opening: “Add `th|es|it|nl|pt` to `ALL_LANGS`.”  
Good opening: “Let a shop `registerLanguage` and drive `i18n.enabled` /
`VITE_ENABLED_LANGUAGES` from config; locale plugins supply catalogs.”

## Document skeleton

```markdown
# tuucho-ecom deltas still required by <shop-id> (against <tag>)

<One short paragraph: this shop’s tuucho tree is <tag> plus the forks
below. The product checkout was not edited (or: patches live only under
the shop’s vendored tuucho/).>

## 1. …

## 2. …

## Observed, not patched

- …

## Not a kernel opening

- …

## Closed since previous delta (optional)

- <item> — opened in <tag> via <brief>
```

## How to discover gaps (shop audit)

Work from the shop checkout that vendors or nests tuucho:

1. Note `version` in the shop’s product `package.json` (or lock / apply
   stamp) → that is `<tag>`.
2. Diff the shop’s `tuucho/kernel`, `tuucho/plugin-sdk`, and product docs
   against a clean clone of that tag (or `git diff` if the shop tracks
   upstream). Ignore `src/plugins/` and `tuucho-config/` unless the diff
   proves a kernel change was required.
3. For each hunk, write one delta item: stock behaviour → shop patch →
   proposed opening.
4. Re-read plugin skills (`tuucho-plugin-opening`, locale, slot, …). If an
   existing opening already covers the need, **delete** the delta item and
   tell the shop to use the opening instead of forking.
5. Prefer one concern per numbered section (languages ≠ favicon ≠ cart
   notice ≠ path join ≠ middleware order).

## How the product repo exploits the file

In the **tuucho-ecom product** tree, a later release task should:

1. Read every **Forked** item; ignore shop brand copy.
2. Design openings that are shop-agnostic (registry, keys, helpers, mount
   order, path normalize).
3. Implement via the usual skills; bump the product version; document under
   “What X.Y.Z changes for plugin authors” in `tuucho/docs/plugins.md`.
4. Ask the shop to re-audit on the new tag and shrink the delta file.

Do not paste shop-specific catalogs, languages, or assets into the kernel
while “fixing” a delta.

## Anti-patterns

- Listing plugin feature ideas that never touched the kernel.
- “Make the kernel like this shop” (hard-coded locale lists, brand paths).
- Vague items (“i18n is insufficient”) without paths or a proposed opening.
- Embedding secrets or private config dumps.
- Mixing deploy/LWS shop scripts into “kernel fork” unless the product
  wrongly owned that code and the shop had to patch product files.
- Using the delta as a substitute for a product PR: the delta is the
  **spec**; the opening lands upstream.

## Example tone (fictional shop)

```markdown
# tuucho-ecom deltas still required by acme-shop (against 0.0.7)

Local `tuucho/` is 0.0.7 plus the two gaps below. Product upstream was not
edited.

## 1. Storefront languages are a closed en | fr union

Stock 0.0.7 types … `ALL_LANGS` … There is no way for this shop to enable a
third code without a kernel edit.

What the shop copy does:
- Widens `Lang` and build lists to include a third code for its market.
- Locale packs stay in `src/plugins/…-locale-*`.

Opening that would remove the fork: let a shop register language codes
(native name, OG locale, date locale) and have `i18n.enabled` validate and
drive the front build list. Locale plugins already supply catalogs.

## Observed, not patched

- `config:doctor` lists a misleading environment name for a reserved
  filename pattern.

## Not a kernel opening

- Host panel API token. Belongs in shop deploy env or a plugin `secret`
  field if a plugin must call that host.
```

(Replace with real paths/symbols when auditing a live shop.)
