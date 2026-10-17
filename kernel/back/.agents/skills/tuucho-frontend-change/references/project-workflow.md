# Tuucho cross-repository workflow

Read this reference for API contracts, manager data, dependencies, versions,
security findings, third-party providers, releases, or work spanning repositories.

## Ownership map

| Repository         | Owns                                                                                                                | Frontend consequence                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `kernel/back`    | PostgreSQL schema, JSON API, authentication, checkout, shipping, vouchers, invoices, and server validation          | Read `docs/api/` before changing a public contract; update typed client expectations in the same task when authorized. |
| `kernel/front`   | Customer-facing Vite/React application, presentation, client state, theme, localization, and browser interactions   | Make frontend changes here and follow its `AGENTS.md`, architecture, theming, and commands.                            |
| `catalog source` | Source product catalogue, accessory/gallery assets, courier definitions, and sensitive local order/voucher archives | Inspect source data only when relevant; never run imports or expose archives without explicit authorization.           |
| External providers | Provider dashboards, accounts, credentials, webhooks, policies, and service-side configuration                      | Treat as a separate explicit operation; ordinary frontend work does not authorize it.                                  |

Do not make the frontend authoritative for price, stock, delivery availability,
payment outcome, identity, or authorization. Client validation improves the
experience but never replaces server validation.

## Contract changes

1. Read the relevant backend files under `docs/api/` and the owning route,
   service, and schema documentation before changing a request or response.
2. Search frontend API modules, types, state, routes, and tests for every
   consumer. Search manager tooling if it creates or imports affected data.
3. Prefer backward-compatible server changes. Keep response envelopes and
   documented error semantics intact.
4. Update documentation and all in-scope consumers together. Do not leave an
   undocumented compatibility assumption in UI code.
5. Verify success, empty, slow, retry, unauthorized, validation-error, and
   server-failure states as applicable.

Manager imports (`library`, `accessory`, `courier`, and `voucher`) and any
prepare/clear/delete operation remain separate, explicitly authorized actions.
If updated source data still needs importing, report the exact command as an
outstanding action instead of running it.

## Third-party products and providers

Stripe, social sign-in providers, couriers, analytics, hosting, and any other
third-party product are outside the implicit scope of work started from this
repository. Code adapters or UI around an existing integration may be changed
when requested, but do not:

- Open or mutate a provider dashboard, account, product, webhook, credential,
  or live configuration without an explicit request and authorization.
- Guess a current provider API or policy. For provider-specific changes, use
  the applicable project skill and current official documentation.
- Copy provider secrets into code, logs, issues, fixtures, documentation, or
  conversation output.
- Treat a sandbox operation as permission for preproduction or production.

Report any external configuration or operator step still required after the
code change.

## Sensitive data and incidental security findings

Never open, print, search inside, copy, or expose `.private.env` files,
credentials, session/payment tokens, private uploads, customer PII, or manager
`order/` and `voucher/` archives unless an explicitly authorized task genuinely
requires a safe operation on that data. Prefer metadata and code-path inspection.

When unrelated work reveals a possible secret, PII exposure, authorization gap,
unsafe logging, insecure storage, or dependency vulnerability:

1. Stop reproducing the value and minimize further access.
2. Preserve evidence without sensitive contents: repository, safe path/line,
   category, how it was encountered, likely impact, confidence, and safe next
   step.
3. Report it to the user. Do not silently remediate, rotate credentials, alter
   data, or mix the fix into the current change.
4. Continue only the original work if doing so does not worsen the exposure.
   Ask for a separate authorized remediation scope when needed.

If the requested task itself is a security remediation, follow that explicit
scope, keep evidence redacted, and verify the boundary without touching live
secrets or data.

## Project and dependency versions

Treat the three sibling `package.json` versions as one release-cadence signal.
For cross-repository, release, build-tool, or dependency work:

1. Read the `version`, `engines`, package-manager metadata, manifest, and lockfile
   in every affected repository. Use the frontend's currently documented Node
   range and repository-selected runtime rather than hardcoding one in the task.
2. Compare the backend, frontend, and manager application versions before and
   after the work. Report exact drift and compatibility impact.
3. Never bump an application version without an explicit request. When a
   coordinated release is authorized, keep intended versions aligned and alter
   only the owning repository's manifest and lockfile.
4. Do not perform opportunistic dependency upgrades. When dependency maintenance
   is requested, inspect current official release notes, peer/runtime constraints,
   security notices, and migration guidance; update in small compatible groups.
5. Distinguish an outdated package from an exploitable package. Report evidence,
   support horizon, migration risk, and recommended timing rather than chasing
   latest versions blindly.
6. Run the full relevant check suite after dependency or toolchain changes and
   report environment-dependent checks that could not run.

## Handoff checklist

Report:

- Which repository owns each change and every file changed.
- Public contract or shared-component behavior affected.
- Commands run and results, including checks skipped by policy or environment.
- Mobile/theme/locale/accessibility states exercised or still unverified.
- Backend documentation, manager import, migration, deployment, provider, or
  release action still required.
- Exact application-version drift, dependency risk, and incidental security
  findings, with sensitive values redacted.
