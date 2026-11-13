# Gullak testing

Gullak is a browser-first application with no build step. The test setup uses Node.js built-in tools, so it does not add a third-party test dependency.

## Requirements

- Node.js 20 or newer
- npm (included with Node.js)

## Commands

```sh
npm test
npm run test:syntax
npm run check
```

- `npm test` runs the automated core and transaction-flow regression tests using Node's built-in test runner.
- `npm run test:syntax` parses every JavaScript file under `js/` without executing browser UI code.
- `npm run check` runs both checks.

## What is covered now

Coverage includes balance arithmetic, malformed and unknown ledger entries, transaction persistence, overspending prevention (including the ₹100/₹200 regression), exact-balance spending, loans, goal deposits and withdrawals, goal purchase and deletion, transaction deletion, and purchase approvals.

The transaction integration tests exercise the core action flows together. They are not browser automation: they do not simulate real browser UI, family encryption/sync, multiple tabs, or device-to-device behavior. Those remain separate areas for future testing.

## Continuous integration

GitHub Actions runs the syntax check and all automated tests on pushes to `main` and on pull requests targeting `main`.

## Adding tests

Add core behavior tests to `tests/` using files named `*.test.cjs`. Keep tests independent: create a fresh Gullak state in each test and avoid depending on test execution order.


## Browser tests

- Install dependencies with `npm install`.
- Install Chromium with `npx playwright install --with-deps chromium`.
- Run browser tests with `npm run test:browser`.
- The Playwright suite starts the app through `scripts/serve.cjs` and checks real Chromium UI flows: spending and persistence, blocking an overspend in the form, saving into a dream, and opening Family mode.

The browser suite uses isolated browser contexts and seeded local test data. It does not connect to a real family across separate devices or prove cross-device synchronization; Family mode's encryption and multi-device behavior still need dedicated tests and manual verification.
