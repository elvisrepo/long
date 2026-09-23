# Stripe Testing and Load-Testing Policy

## Use When

- Implementing Stripe Checkout, Billing, webhooks, or subscription lifecycle code.
- Choosing between mocked tests, Stripe sandbox tests, browser E2E tests, and load tests.
- Handling Stripe API rate limits, retries, or secret keys.

## Test Boundaries

| Test type | Stripe access | Purpose |
|---|---|---|
| Unit and focused service tests | Mocked; no network | Validate request construction, response handling, failures, and local subscription state transitions. |
| Backend API tests | Mocked; no network | Validate authentication, permissions, API contracts, idempotency, and database effects. |
| Webhook handler tests | Locally signed fixtures or mocked signature verification | Validate event routing, signature failures, replay protection, ordering, and idempotent processing. |
| Opt-in Stripe integration tests | Stripe sandbox with sandbox secret keys | Verify a small number of real Checkout, Customer, Price, and webhook interactions. These tests are not part of the default test suite. |
| Browser E2E tests | Mocked Stripe boundary; outbound Stripe SDK clients disabled | Validate the user journey without turning Stripe into a dependency for every E2E run. |
| Load and performance tests | Mocked Stripe boundary with configurable latency and failures | Measure our application under load without sending load traffic to Stripe. |

The standard automated test settings use deliberately fake values such as
`sk_test_fake` and `whsec_fake`. This prevents an ordinary `pytest` run from
using a developer's valid sandbox credentials. A separate, explicitly enabled
integration suite may read sandbox credentials from environment variables.

The browser E2E runtime uses defense in depth:

- Compose injects fixed inert Stripe process variables before `base.py` can
  load a developer `.env`;
- `config.settings.e2e` unconditionally replaces all Stripe settings; and
- `STRIPE_OUTBOUND_API_ENABLED=False` makes Checkout and Customer Portal fail
  before constructing `StripeClient` or writing a Checkout attempt.

A real Stripe Checkout smoke test, if introduced, must be a separate opt-in
integration suite with an explicitly enabled runtime. It must not weaken the
default Playwright boundary.

## Sandbox Rules

- Stripe sandbox transactions do not move real funds and support test cards and simulated payment outcomes.
- Sandbox keys are valid credentials for that sandbox. They are not placeholders and can create or modify sandbox resources.
- Do not store real customer data in sandbox resources.
- Keep sandbox integration tests small, deterministic where possible, and safe to rerun.
- Clean up or uniquely label test-created Customers, Checkout Sessions, and Subscriptions.
- Never run load, soak, stress, or high-concurrency tests against Stripe sandbox.

## Checkout and Webhook Flow

A Stripe webhook is a server-to-server notification from Stripe to our backend.
It is not called by the browser, and it is not triggered by trusting the
`checkout=success` redirect alone. Stripe sends webhook events when provider-side
state changes, such as Checkout completion, payment success, subscription
creation, subscription update, cancellation, or invoice payment failure.

Stripe only sends webhook events to an HTTPS endpoint that we configure in
Stripe. Stripe does not know about our internal Redis/Celery queue. If we later
want asynchronous processing, our backend still receives and verifies the
webhook first, then enqueues internal work.

For the MVP, the webhook path is direct and synchronous:

```text
Stripe Server
  -> HTTPS POST /api/v1/subscriptions/stripe/webhook/
  -> Django verifies the Stripe signature
  -> Django stores StripeWebhookEvent for replay protection
  -> Django processes the supported event idempotently
  -> Django returns 2xx after safely accepting the event
```

The production-grade extension is:

```text
Stripe Server
  -> HTTPS POST /api/v1/subscriptions/stripe/webhook/
  -> Django verifies the Stripe signature
  -> Django stores StripeWebhookEvent
  -> Django enqueues a Celery task
  -> Django returns 2xx quickly
  -> Celery worker applies subscription changes
```

We are not using the queue-based path yet. Keep the current handler small,
idempotent, and fast enough to run during the webhook request.

The intended Checkout flow is:

1. The user clicks an upgrade button in Settings, such as `Upgrade to Pro Monthly`.
2. The frontend sends our backend the internal `SubscriptionPrice.id`:

   ```http
   POST /api/v1/subscriptions/checkout/
   {
     "price_id": "local-subscription-price-uuid"
   }
   ```

3. The backend looks up the local `SubscriptionPrice`.
4. The backend sends Stripe the server-side `provider_price_id`, for example
   `price_...`.
5. Stripe creates a hosted Checkout Session.
6. The backend returns the hosted URL:

   ```json
   {
     "url": "https://checkout.stripe.com/c/..."
   }
   ```

7. The frontend redirects the browser to Stripe Checkout.
8. The user enters test or live payment details on Stripe.
9. Stripe processes the payment and subscription creation.
10. Stripe redirects the browser to our configured success or cancel URL, such
    as `http://localhost:5173/settings?checkout=success`.
11. Separately, Stripe sends a signed webhook request to our backend:

    ```http
    POST /api/v1/subscriptions/stripe/webhook/
    ```

12. Our backend verifies the Stripe signature before trusting the event.
13. Our backend processes the event, finds the matching `CheckoutAttempt`,
    `SubscriptionPlan`, and `SubscriptionPrice`, then changes the user's
    subscription entitlements.

The browser redirect is only user-facing UI feedback. It is not proof of
payment, and it must not unlock paid entitlements by itself. The webhook is the
trusted provider confirmation.

## Local Checkout Smoke Test

This flow was verified end to end against the Stripe sandbox on July 2, 2026.
It is an opt-in manual smoke test, not part of the default automated suite.

Prerequisites:

1. Run the Django stack with the Stripe Python SDK installed in the image.
2. Install Stripe CLI, authenticate with `stripe login`, and select the intended
   sandbox.
3. Start a dedicated listener terminal:

   ```bash
   stripe listen \
     --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted \
     --forward-to http://localhost:8000/api/v1/subscriptions/stripe/webhook/
   ```

4. Copy the listener's `whsec_...` value into the ignored backend `.env` as
   `STRIPE_WEBHOOK_SECRET`.
5. Recreate the web container so Django loads the environment change:

   ```bash
   docker compose up -d --force-recreate web
   ```

Local forwarding uses HTTP because the CLI and Django communicate on the same
machine. A registered public Stripe event destination must use a publicly
accessible HTTPS URL with a valid TLS certificate.

Before creating a real sandbox Checkout, verify the transport and signature
boundary:

```bash
stripe trigger checkout.session.completed
```

Expected results:

- the listener reports a `200` response from the local webhook endpoint;
- Django stores a `StripeWebhookEvent`;
- no entitlement changes occur because the synthetic event does not contain a
  matching local `CheckoutAttempt` and server-generated metadata.

For the real Checkout:

1. Start from a local Free subscription with no active Stripe subscription for
   that user.
2. Keep `stripe listen` running.
3. Select a paid price from Settings and use Stripe's successful test card:
   `4242 4242 4242 4242`, any future expiry, and any three-digit CVC.
4. Confirm that the listener reports:

   ```text
   --> checkout.session.completed
   <-- [200] POST http://localhost:8000/api/v1/subscriptions/stripe/webhook/
   ```

5. Confirm both provider and local state:

   - Stripe has one active sandbox Customer and Subscription.
   - The previous local Free `Subscription` is `cancelled`.
   - A new local Pro `Subscription` is `active` with the Stripe
     `provider_subscription_id`.
   - `BillingCustomer` stores the Stripe `cus_...` identifier.
   - The matching `CheckoutAttempt` is `confirmed`.
   - `StripeWebhookEvent` stores the provider event ID.

## Presentation-Staging Webhook Verification

Verified on 2026-09-13 against the Stripe sandbox:

- the registered HTTPS endpoint is
  `https://staging.syncvitals.space/api/v1/subscriptions/stripe/webhook/`;
- it subscribes only to `checkout.session.completed`,
  `customer.subscription.updated`, and `customer.subscription.deleted`;
- its one-time signing secret is stored in AWS Secrets Manager and is never
  recorded in repository files or operational output;
- Django loaded the new secret after recreating only the API container;
- Stripe CLI generated a synthetic `checkout.session.completed`, Django
  accepted the signature, and `StripeWebhookEvent` recorded the delivery;
- the synthetic event did not change the existing Free subscription because it
  did not correspond to an application-created `CheckoutAttempt`; and
- unsigned public POSTs return `400`, while database-backed readiness remains
  healthy.

The operator then completed a real hosted Checkout for the monthly Pro price.
Read-only verification through Systems Manager checked the running Django
container and Stripe's API without printing secrets or full customer and
subscription identifiers:

- the application-created `CheckoutAttempt` is `confirmed`;
- the previous local Free subscription is `cancelled`;
- the current local Pro monthly subscription is `active`;
- a local Stripe `BillingCustomer` and provider subscription reference exist;
- Stripe reports the same subscription as active in test mode; and
- Stripe's customer and price references match Django's stored references.

The event ledger contains the earlier synthetic Checkout event and the real
Checkout event. Only the real event carried matching application-created
metadata and changed entitlements.

This proves public transport, signing-secret alignment, signature validation,
event persistence, real Checkout metadata, and entitlement promotion. Customer
Portal behavior and the cancellation lifecycle remain unverified in staging.

## Local Versus Presentation-Staging Stripe Flow

Both environments currently use test mode in the same Stripe sandbox account,
but they are separate application runtimes with separate PostgreSQL databases.
Local users, Checkout attempts, webhook-event rows, billing-customer rows, and
subscription rows do not automatically copy to staging, or vice versa. Stripe
provider objects are visible in the shared sandbox, so test objects must still
be labelled and managed carefully.

| Concern | Local development | Presentation staging |
|---|---|---|
| Application code | Host source is bind-mounted into the development container; code edits are visible immediately and Django can reload. | Runtime source is baked into an immutable production image, pushed to ECR, selected by digest, and run without a source bind mount. Never edit application source inside the running container. |
| Django process | Development server in the Compose `web` container using `config.settings.dev`. | Gunicorn in the EC2 `api` container using `config.settings.prod`. |
| Browser/API path | Browser uses the local frontend; its API traffic reaches the published Django port at `localhost:8000`, directly or through the frontend development proxy. | Browser uses `staging.syncvitals.space`; CloudFront routes `/api/*` to the protected origin, then Nginx proxies accepted HTTPS traffic to loopback-only Gunicorn. |
| Stripe API calls | Django calls the Stripe sandbox using test credentials loaded from the ignored local `.env`. | Django calls the same Stripe sandbox using test credentials retrieved from AWS Secrets Manager at container start. |
| Webhook reachability | Stripe cannot call `localhost`. A running `stripe listen` process receives sandbox events and forwards them over local HTTP to Django. | Stripe calls the registered, stable public HTTPS webhook directly. No Stripe CLI listener is required for normal delivery. |
| Signing secret | `stripe listen` prints a listener-specific `whsec_...`; local Django must load that current value. Restarting the listener can require updating `.env` and recreating `web`. | The registered endpoint has its own `whsec_...`, stored only in Secrets Manager. Changing it requires a new secret version and API-container recreation. It is not the local listener secret. |
| PostgreSQL persistence | The local database container writes to Docker named volume `pgdata`. | The EC2 database container writes through `/srv/syncvitals/postgresql` to the separate encrypted EBS filesystem. |
| Runtime configuration refresh | Recreate affected local containers; rebuild when image dependencies change. | Recreate only the affected container to reload secrets/configuration. A code change instead requires a newly built and tested image, an ECR push, and deployment by exact digest. |

### Complete Local Manual Flow

```text
Local browser
  -> local frontend
  -> Django web container on localhost:8000
  -> Django creates CheckoutAttempt in local PostgreSQL
  -> Django creates a hosted Checkout Session in Stripe test mode
  -> browser completes Checkout on Stripe
  -> Stripe redirects browser to the local Settings URL

Separately:
Stripe sandbox event
  -> running `stripe listen` process on the developer machine
  -> HTTP forward to localhost:8000/api/v1/subscriptions/stripe/webhook/
  -> Django verifies the signature with the listener-specific secret
  -> Django records StripeWebhookEvent in local PostgreSQL
  -> Django confirms the CheckoutAttempt and changes local entitlements
```

The local listener is a development bridge, not part of the application and
not a deployed service. If it is stopped, Checkout can still succeed at Stripe
and the browser can still be redirected, but local Django will not receive the
forwarded webhook at that time.

### Complete Presentation-Staging Manual Flow

```text
Public browser
  -> CloudFront
  -> /api/* behavior
  -> Nginx on the EC2 origin
  -> loopback-only Gunicorn/Django container
  -> Django creates CheckoutAttempt in EBS-backed PostgreSQL
  -> Django creates a hosted Checkout Session in Stripe test mode
  -> browser completes Checkout on Stripe
  -> Stripe redirects browser to the staging Settings URL

Separately:
Stripe sandbox event
  -> registered public HTTPS webhook
  -> CloudFront /api/* behavior
  -> Nginx
  -> Gunicorn/Django
  -> Django verifies the signature with the registered-endpoint secret
  -> Django records StripeWebhookEvent in EBS-backed PostgreSQL
  -> Django confirms the CheckoutAttempt and changes staging entitlements
```

### Where The Staging Webhook Work Was Performed

- The webhook endpoint was registered in Stripe's sandbox from the local
  workstation using authenticated Stripe tooling.
- Its one-time signing secret was transferred directly into a new version of
  `longevity/staging/backend-runtime` in AWS Secrets Manager. It was not
  committed, saved in a repository file, or intentionally printed.
- Systems Manager Run Command reached the EC2 host and Docker Compose recreated
  only the API container so it could load the new secret. PostgreSQL remained
  running and untouched.
- EC2 used short-lived instance-role ECR authentication for the recreation and
  removed the Docker authorization afterward.
- A synthetic sandbox event tested signed delivery. A separate unsigned public
  POST returned `400`, proving that the endpoint does not trust arbitrary
  callers.
- The success and cancellation destinations were read from the running Django
  configuration and verified to point to staging.

Those operations changed Stripe configuration, a Secrets Manager value, and
the running API-container instance. They did not patch application source code
inside EC2. Earlier application fixes followed the separate deployment path:
change and test code locally, build the production image, push it to ECR, and
deploy that exact image digest.

## Stripe Cancellation Lifecycle

Cancellation is a two-event lifecycle rather than an immediate local downgrade:

1. The user schedules cancellation in Stripe.
2. Stripe sends `customer.subscription.updated` with the current period
   timestamps and cancellation timing. Depending on the Stripe billing mode and
   Portal behavior, period-end cancellation can arrive as
   `cancel_at_period_end=true` or as `cancel_at` equal to the subscription
   item's `current_period_end` while `cancel_at_period_end=false`.
3. Django verifies that both the Stripe subscription ID and customer ID match
   the current local subscription and its `BillingCustomer`.
4. Django stores the exact `cancel_at` timestamp, normalizes local
   `cancel_at_period_end`, and stores the period boundaries, but keeps the paid
   subscription active.
5. At the end of the paid period, Stripe ends the provider subscription and
   sends `customer.subscription.deleted`.
6. Django repeats the subscription/customer ownership check, cancels the local
   paid subscription, and creates a new active Free subscription.

The application does not downgrade from the browser redirect or merely because
`cancel_at` is populated or `cancel_at_period_end` is true. Stripe's verified
terminal event is the authority that the paid entitlement period has ended.

### Cancellation Event and Code Flow

Stripe owns billing state and cancellation timing. Our application owns local
subscription history and entitlements. Clicking **Cancel subscription** in the
Customer Portal starts this collaboration:

```text
User cancels in the Stripe Customer Portal
  -> Stripe schedules cancellation with cancel_at_period_end=true or cancel_at=<timestamp>
  -> Stripe emits customer.subscription.updated
  -> Stripe POSTs the signed event to /api/v1/subscriptions/stripe/webhook/
  -> Django verifies the Stripe-Signature header
  -> Django verifies the subscription and customer belong to the same user
  -> Django stores cancel_at, the normalized cancellation flag, and paid-period boundaries
  -> the local paid subscription remains active

At the paid period end
  -> Stripe terminates the provider subscription
  -> Stripe emits customer.subscription.deleted
  -> Stripe POSTs the signed event to the same webhook endpoint
  -> Django verifies the signature, subscription, and customer again
  -> Django cancels the local paid subscription
  -> Django creates a new active Free subscription
```

The backend implementation is split across these boundaries:

- `apps/subscriptions/urls.py` maps `stripe/webhook/` to
  `StripeWebhookView`.
- `StripeWebhookView.post()` in `apps/subscriptions/views.py` reads the
  `Stripe-Signature` header, calls `verify_stripe_webhook_event()`, and only
  dispatches successfully verified events.
- `verify_stripe_webhook_event()` in `apps/subscriptions/services.py` calls
  `stripe.Webhook.construct_event()` with the raw request body, signature, and
  configured webhook secret.
- `process_stripe_webhook_event()` stores the Stripe event ID in
  `StripeWebhookEvent` for replay protection, then dispatches
  `customer.subscription.updated` and `customer.subscription.deleted`.
- `process_stripe_subscription_updated()` verifies the provider subscription
  ID and `BillingCustomer`, then stores Stripe `cancel_at`,
  `current_period_start`, and `current_period_end`. If the subscription item
  includes a recognized active Stripe `price.id`, it also updates the local
  `SubscriptionPrice` and `SubscriptionPlan` so Portal monthly/yearly changes
  do not drift from Stripe. Unknown or inactive Stripe price IDs are logged with
  provider identifiers and leave the local price unchanged. It normalizes local
  `cancel_at_period_end` to true when Stripe sends either
  `cancel_at_period_end=true` or `cancel_at == current_period_end`. It does not
  downgrade the user.
- `process_stripe_subscription_deleted()` repeats the ownership checks and
  calls `change_subscription_plan()` with the default Free plan.
- `change_subscription_plan()` serializes the transition with a database row
  lock, marks the paid subscription cancelled, and creates the replacement
  active Free subscription in one transaction.

In local development, Stripe cannot call `localhost` directly. The Stripe CLI
receives the sandbox events and forwards them to
`http://localhost:8000/api/v1/subscriptions/stripe/webhook/`. In production,
Stripe calls the public HTTPS webhook endpoint directly.

## Customer Portal Boundary

The backend creates Stripe Customer Portal Sessions on demand:

1. `GET /api/v1/subscriptions/current/` returns
   `billing_portal_available=true` when the authenticated user has a local
   Stripe `BillingCustomer`; Settings uses this only to control whether the
   **Manage subscription** action is visible.
2. An authenticated request calls `POST /api/v1/subscriptions/portal/`.
3. Django independently resolves the caller's local Stripe `BillingCustomer`;
   UI visibility is not treated as authorization, and the browser
   never supplies a provider customer ID.
4. Django calls `billing_portal.sessions.create` with the stored `cus_...`
   identifier and the server-controlled portal return URL.
5. Stripe returns a short-lived `billing.stripe.com` URL.
6. The API returns that URL for a later frontend redirect.
7. Subscription changes remain authoritative only when signed Stripe webhooks
   update local state.

Portal configuration must be saved independently in each Stripe sandbox and in
live mode. The initial sandbox configuration should allow cancellation and
payment-method management but keep plan switching disabled until local
price-change reconciliation exists.

Automated tests mock `StripeClient` and verify the request contract without
contacting Stripe. A manual sandbox smoke test can create a real portal session
for an existing `BillingCustomer`, but it must remain outside the default suite.

Troubleshooting:

- A `checkout=success` browser redirect alone does not prove webhook delivery.
- If Django has no webhook request log, check that the CLI listener is running.
- If signature verification fails, ensure Django loaded the exact signing secret
  printed by the current listener.
- Stripe's Python SDK returns `stripe.Event`; normalize it with `to_dict()` before
  application code uses dictionary methods such as `.get()`.
- Do not repeat Checkout while an earlier sandbox subscription remains active.
  Cancel the provider subscription first to avoid duplicate billing records.

## Why Stripe Sandbox Is Not a Load-Test Target

Stripe explicitly discourages sandbox load testing:

- Sandbox has a lower global API limit than live mode.
- Sandbox payment processing mocks external payment-gateway work, so its latency is not representative of live payments.
- A sandbox load test can therefore produce both misleading latency results and rate-limit failures that do not model production accurately.

As of June 13, 2026, Stripe documents a general global limit of 25 requests per
second in sandbox and 100 requests per second in live mode. Individual endpoints
generally have their own 25 requests-per-second limit unless documented
otherwise. These are maximums, not throughput targets, and Stripe can change
them.

## Load-Test Design

Load tests should exercise our frontend, Django API, PostgreSQL transactions,
Celery work, and local Stripe adapter while replacing outbound Stripe calls
with a configurable fake.

The fake should support:

- configurable response latency;
- successful Checkout and subscription responses;
- card or provider failures;
- `429 Too Many Requests`;
- network timeouts;
- webhook duplication and out-of-order delivery;
- deterministic provider IDs and idempotency behavior.

For Checkout creation tests, the fake should return a deterministic Checkout
Session ID and URL. Tests should assert that the application sends
`CheckoutAttempt.id` as the Stripe idempotency key and persists the returned
provider session ID locally. The suite must also cover both customer paths:
`customer_email` for first-time Checkout and the stored Stripe `customer` ID
for a user with an existing `BillingCustomer`.

For webhook tests, mock signature verification at the application boundary, then
assert that verified `checkout.session.completed` events confirm the matching
attempt and change the subscription only once per Stripe event ID. Customer
ownership tests must prove that a conflicting or cross-user Stripe customer ID
cannot change local entitlements.

Stripe's Python SDK returns a `stripe.Event` object from signature verification,
not a normal dictionary. Normalize it with the SDK's public `to_dict()` method
at the verification boundary before passing it to application reconciliation.
Keep one regression test backed by an actual SDK event shape so plain-dictionary
mocks cannot hide this mismatch.

Duplicate-delivery coverage exists at two boundaries:

- The endpoint test pre-creates a `StripeWebhookEvent`, posts the same provider
  event ID again, and proves the webhook still returns `200` while retaining
  only one event ledger row. Stripe therefore receives a successful
  acknowledgment for an event we already accepted.
- The service test calls `process_stripe_webhook_event` twice with the same
  `checkout.session.completed` event and proves the subscription transition
  occurs only once. The final history contains the cancelled Free subscription
  and one active Pro subscription, not a second Pro subscription.

Once live traffic exists, choose simulated latency from observed Stripe request
durations rather than sandbox timings. Do not record secrets, payment details,
or sensitive response bodies while collecting those measurements.

## Production Rate-Limit Handling

- Treat `429` responses as recoverable only when the operation is safe to retry.
- Use exponential backoff with jitter to avoid synchronized retries.
- Inspect `Stripe-Rate-Limited-Reason` when present to distinguish global,
  endpoint, concurrency, and resource-specific limiting.
- Use Stripe idempotency keys for retryable create operations.
- Use a per-attempt UUID, such as `CheckoutAttempt.id`, rather than broad
  deterministic keys derived from user and price IDs.
- Store processed webhook event IDs locally, such as
  `StripeWebhookEvent.provider_event_id`, because Stripe can deliver the same
  event more than once.
- Serialize simultaneous mutations to the same Stripe object where practical;
  Stripe can return `429` with `lock_timeout` for object lock contention.
- Monitor request rate, latency, `429` frequency, timeout frequency, and retry
  exhaustion without logging API keys or payment data.

## Credential Policy

- Real sandbox secrets live only in local environment variables or an approved
  secret manager.
- Production secrets must come from the deployment platform's secret manager,
  not a deployed `.env` file.
- `.env.example` contains names and non-secret defaults only.
- Publishable keys may be exposed to browser code; secret keys and webhook
  signing secrets must never be exposed to the frontend.
- Do not capture or share unredacted `docker compose config` output: Compose may
  interpolate the Stripe values loaded through `.env` or `env_file`. Prefer
  scoped commands such as `docker compose config --services` when only
  structural metadata is needed.
- Rotate any secret immediately after accidental disclosure.

## Official Sources

- [Stripe testing](https://docs.stripe.com/testing)
- [Stripe API rate limits and load testing](https://docs.stripe.com/rate-limits#load-testing)
- [Stripe API key best practices](https://docs.stripe.com/keys-best-practices)
