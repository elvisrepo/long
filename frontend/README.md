# Longevity Frontend

React + TypeScript frontend for the Longevity app.

## Common Commands

```bash
npm run dev
npm run test
npm run build
```

## Browser E2E

Run Playwright from this directory:

```bash
npm run test:e2e
```

The Playwright config starts the backend Docker Compose `e2e` profile automatically. That profile runs Django with `config.settings.e2e` on `http://127.0.0.1:8001` and uses the isolated `db-e2e/longevity_e2e` database, not the normal local development database.

The E2E runtime receives inert Stripe values and disables outbound Stripe SDK
clients. Browser Checkout coverage mocks both the backend Checkout response and
the hosted Stripe page; real Stripe sandbox checks belong in a separate opt-in
integration suite.

Each auth E2E test resets the isolated E2E database through `POST /api/testing/reset/` before it runs.
