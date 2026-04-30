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

Each auth E2E test resets the isolated E2E database through `POST /api/testing/reset/` before it runs.
