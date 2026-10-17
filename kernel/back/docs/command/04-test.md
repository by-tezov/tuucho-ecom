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
npm --prefix ../front run test
npm --prefix ../front run test:unit
```

## `npm run test:coverage`

Runs back then front unit coverage and refreshes the report hub.

```bash
npm run test:coverage
npm run test:coverage:back
npm run test:coverage:front
```

| Script | Output |
| ------ | ------ |
| `npm run test:coverage:back` | c8 HTML under `output/report/coverage/back/` |
| `npm run test:coverage:front` | Vitest HTML under `output/report/coverage/front/` |
| `npm run test:coverage` | both of the above, then `tsx scripts/writeReportHub.ts` |
