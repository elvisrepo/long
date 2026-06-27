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
| Browser E2E tests | Prefer mocked Stripe boundary; use sandbox only for a small functional checkout smoke test | Validate the user journey without turning Stripe into a dependency for every E2E run. |
| Load and performance tests | Mocked Stripe boundary with configurable latency and failures | Measure our application under load without sending load traffic to Stripe. |

The standard automated test settings use deliberately fake values such as
`sk_test_fake` and `whsec_fake`. This prevents an ordinary `pytest` run from
using a developer's valid sandbox credentials. A separate, explicitly enabled
integration suite may read sandbox credentials from environment variables.

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
provider session ID locally.

For webhook tests, mock signature verification at the application boundary, then
assert that verified `checkout.session.completed` events confirm the matching
attempt and change the subscription only once per Stripe event ID.

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
- Rotate any secret immediately after accidental disclosure.

## Official Sources

- [Stripe testing](https://docs.stripe.com/testing)
- [Stripe API rate limits and load testing](https://docs.stripe.com/rate-limits#load-testing)
- [Stripe API key best practices](https://docs.stripe.com/keys-best-practices)
