# Tests

Unit tests only. Functional, API, load, visual, and preprod suites are gone.

## `npm run test`

Alias of `npm run test:unit`.

```bash
npm run test
npm run test:unit
```

Runs every unit test under `src-test/unit-test/**/*.test.ts` on Node's built-in
test runner. Part of `npm run check`. Unit tests must not live under `src/`;
architecture check rejects colocated `*.test.ts`.

Two kinds of test live here:

- **Domain tests**, under `src-test/unit-test/modules/*/domain/` (mirroring
  `src/modules/*/domain/`). Those modules have no Express, `pg`, filesystem,
  provider SDK or global config, so these are plain function calls.
- **HTTP-surface tests** in `src-test/unit-test/app.test.ts`. They mount the
  real composed app with `createApp()` on an ephemeral loopback port and cover
  the guards that run before any handler reaches the database.

Neither kind touches PostgreSQL, Stripe or the network. `APP_TARGET` defaults
to `dev` so the layered env loads for app-surface tests. Add a new unit test
under `src-test/unit-test/`, mirroring the `src/` path.

Front unit tests are Vitest:

```bash
npm --prefix tuucho/kernel/front run test
npm --prefix tuucho/kernel/front run test:unit
```

## `npm run test:coverage`

Runs back then front unit coverage and refreshes the report hub.

```bash
npm run test:coverage
npm run test:coverage:back
npm run test:coverage:front
```

Reports land under the configured `paths.outputDir` (default `<clone
root>/output`; see the Configuration section of the root README).

| Script | Output |
| ------ | ------ |
| `npm run test:coverage:back` | c8 HTML under `<outputDir>/report/coverage/back/` |
| `npm run test:coverage:front` | Vitest HTML under `<outputDir>/report/coverage/front/` |
| `npm run test:coverage` | both of the above, then `tsx scripts/writeReportHub.ts` |

## Test-harness environment

Disposable servers and fake provider credentials for local/CI harnesses. None
of these ever apply on `APP_TARGET=prod`.

### `TUUCHO_TEST_*` overlays

Read after the `tuucho-config/` flatten, so they win over JSON and leftover
process env. URL overlays always override; the value overlays below only fill
a target that is unset (an explicit `VITE_*` always wins). They matter when
the front is served by the dev server spawned from the back env.

| Key | Sets |
| --- | ---- |
| `TUUCHO_TEST_API_BASE` | `URL_API_BASE` (trailing slash trimmed) |
| `TUUCHO_TEST_SITE_URL` / `TUUCHO_TEST_FRONTEND_BASE` | `URL_FRONTEND_BASE` |
| `TUUCHO_TEST_PUBLIC_MEDIA` | `URL_PUBLIC_MEDIA` |
| `TUUCHO_TEST_LOADING_MIN` | `VITE_LOADING_MIN`, `VITE_LOADING_MIN_SHORT`, `VITE_LOADING_MIN_LONG` when unset |
| `TUUCHO_TEST_BOOT_SPLASH_SPEED` | `VITE_BOOT_SPLASH_SPEED` when unset |

### Identity test tokens

Fake social sign-in credentials for harnesses, gated by
`identity.allowTestTokens` (env `TUUCHO_IDENTITY_ALLOW_TEST_TOKENS=true`) and
never honored on `prod`. The token prefix comes from
`identity.testTokenPrefix` (env `IDENTITY_TEST_TOKEN_PREFIX`), default
`tuucho-test:`. Any non-empty string is accepted; regex metacharacters stay
literal. With the default the tokens are:

- Google: `tuucho-test:google:<email>`
- Facebook: `tuucho-test:facebook:<userId>:<email>`
- Apple: `tuucho-test:apple:<sub>:<email>`

A shop that forks the harness can switch to its own prefix (for example
`shop-test-`, giving `shop-test-google:<email>`) without touching the kernel.
A blank value falls back to the default.

