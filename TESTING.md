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

- `npm test` runs the automated core tests using Node's built-in test runner.
- `npm run test:syntax` parses every JavaScript file under `js/` without executing browser UI code.
- `npm run check` runs both checks.

## What is covered now

The initial suite characterizes core ledger behavior: fresh state, balance arithmetic, malformed ledger amounts, transaction persistence, invalid amounts, overspending prevention, exact-balance spending, goal contribution limits, and transaction deletion safeguards.

These are baseline tests, not a complete browser or end-to-end suite. They do not yet simulate real browsers, family encryption flows, multiple tabs, or UI interactions. Those require a later testing layer.

## Continuous integration

GitHub Actions runs the syntax check and core tests on pushes to `main` or `testing`, and on pull requests targeting `main`.

## Adding tests

Add core behavior tests to `tests/` using files named `*.test.cjs`. Keep tests independent: create a fresh Gullak state in each test and avoid depending on test execution order.
