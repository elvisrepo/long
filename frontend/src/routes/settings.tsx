import { useState } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { requireAuthBeforeLoad } from "../features/auth/require-auth-before-load";
import { useMeQuery } from "../features/auth/use-me-query";
import { redirectToCheckout } from "../features/subscriptions/checkout-redirect";
import { redirectToPortal } from "../features/subscriptions/portal-redirect";
import type {
  CurrentSubscription,
  SubscriptionPlan,
} from "../features/subscriptions/subscriptions-api";
import { useCreateSubscriptionCheckoutMutation } from "../features/subscriptions/use-create-subscription-checkout-mutation";
import { useCreateSubscriptionPortalMutation } from "../features/subscriptions/use-create-subscription-portal-mutation";
import { useCurrentSubscriptionQuery } from "../features/subscriptions/use-current-subscription-query";
import { useSubscriptionPlansQuery } from "../features/subscriptions/use-subscription-plans-query";

interface SettingsSearch {
  checkout?: "success" | "cancelled";
}

function formatSyncPolicy(plan: SubscriptionPlan): string {
  const mode = plan.automatic_sync_enabled ? "Automatic" : "Manual";
  return `${mode} sync every ${plan.sync_interval_minutes} minutes`;
}

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuthBeforeLoad,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    if (search.checkout === "success" || search.checkout === "cancelled") {
      return {
        checkout: search.checkout,
      };
    }

    return {};
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const checkoutStatus = useRouterState({
    select: (state) => state.location.search.checkout,
  });
  const meQuery = useMeQuery();
  const currentSubscriptionQuery = useCurrentSubscriptionQuery();
  const subscriptionPlansQuery = useSubscriptionPlansQuery();
  const checkoutMutation = useCreateSubscriptionCheckoutMutation();
  const portalMutation = useCreateSubscriptionPortalMutation();
  const [errorMessage, setErrorMessage] = useState("");

  const paidPlans =
    subscriptionPlansQuery.data?.filter(
      (plan) => !plan.is_default && plan.prices.length > 0,
    ) ?? [];
  const usesStripePortal =
    currentSubscriptionQuery.data?.billing_portal_available === true;

  async function handleCheckout(priceId: string) {
    try {
      setErrorMessage("");
      const checkout = await checkoutMutation.mutateAsync({ priceId });
      redirectToCheckout(checkout.url);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("Checkout failed to start");
    }
  }

  async function handlePortal() {
    try {
      setErrorMessage("");
      const portal = await portalMutation.mutateAsync();
      redirectToPortal(portal.url);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("Customer Portal failed to open");
    }
  }

  if (!meQuery.data) {
    return <p>Loading...</p>;
  }

  return (
    <section className="settings-screen">
      <header className="settings-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Settings</h1>
          <p>Signed in as {meQuery.data.email}</p>
        </div>
      </header>

      {checkoutStatus === "success" ? (
        <p className="settings-alert" role="status">
          Checkout completed. Your plan will update after payment confirmation.
        </p>
      ) : null}
      {checkoutStatus === "cancelled" ? (
        <p className="settings-alert" role="status">
          Checkout cancelled. Your plan was not changed.
        </p>
      ) : null}

      <section
        className="subscription-card subscription-card-featured"
        aria-label="Current subscription"
      >
        <div className="subscription-card-header">
          <div>
            <p className="meta-label">Current subscription</p>
            <h2>Current Plan</h2>
          </div>
          {currentSubscriptionQuery.data ? (
            <span
              className={`status-pill${
                currentSubscriptionQuery.data.status === "active" ||
                currentSubscriptionQuery.data.cancel_at
                  ? ""
                  : " subscription-status-problem"
              }`}
            >
              {formatSubscriptionStatus(currentSubscriptionQuery.data)}
            </span>
          ) : null}
        </div>
        {currentSubscriptionQuery.isPending ? (
          <SubscriptionLoadingSkeleton label="Loading current subscription" />
        ) : null}
        {currentSubscriptionQuery.isError ? (
          <p className="settings-inline-error" role="alert">
            Current plan failed to load.
          </p>
        ) : null}
        {currentSubscriptionQuery.data ? (
          <>
            <div className="subscription-current-layout">
              <div>
                <h3>{currentSubscriptionQuery.data.plan.name}</h3>
                <div className="subscription-detail-grid">
                  <div>
                    <span className="subscription-detail-label">Metrics</span>
                    <strong>
                      {
                        currentSubscriptionQuery.data.plan
                          .active_custom_metric_limit
                      }{" "}
                      custom metrics
                    </strong>
                  </div>
                  <div>
                    <span className="subscription-detail-label">Sync</span>
                    <strong>
                      {formatSyncPolicy(currentSubscriptionQuery.data.plan)}
                    </strong>
                  </div>
                  {currentSubscriptionQuery.data.price ? (
                    <div>
                      <span className="subscription-detail-label">Price</span>
                      <strong>
                        {formatSubscriptionPrice(
                          currentSubscriptionQuery.data.price.unit_amount,
                          currentSubscriptionQuery.data.price.currency,
                        )}{" "}
                        / {currentSubscriptionQuery.data.price.billing_interval}
                      </strong>
                    </div>
                  ) : null}
                  {currentSubscriptionQuery.data.price ? (
                    <div>
                      <span className="subscription-detail-label">
                        Interval
                      </span>
                      <strong>
                        {formatBillingInterval(
                          currentSubscriptionQuery.data.price.billing_interval,
                        )}
                      </strong>
                    </div>
                  ) : null}
                </div>
                <PlanCapabilityList plan={currentSubscriptionQuery.data.plan} />
              </div>
              <div className="subscription-billing-panel">
                {currentSubscriptionQuery.data.cancel_at ? (
                  <p>
                    Cancels{" "}
                    {formatSubscriptionDate(
                      currentSubscriptionQuery.data.cancel_at,
                    )}
                  </p>
                ) : currentSubscriptionQuery.data.current_period_end ? (
                  <p>
                    Renews{" "}
                    {formatSubscriptionDate(
                      currentSubscriptionQuery.data.current_period_end,
                    )}
                  </p>
                ) : (
                  <p>No paid billing period yet.</p>
                )}
              </div>
            </div>
            {currentSubscriptionQuery.data.billing_portal_available ? (
              <button
                className="subscription-primary-action"
                type="button"
                disabled={portalMutation.isPending}
                onClick={() => void handlePortal()}
              >
                Manage subscription
              </button>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="subscription-card" aria-label="Available plans">
        <div className="subscription-card-header">
          <div>
            <p className="meta-label">Plan catalog</p>
            <h2>Available Plans</h2>
          </div>
        </div>
        {subscriptionPlansQuery.isPending ? (
          <SubscriptionLoadingSkeleton label="Loading available plans" />
        ) : null}
        {subscriptionPlansQuery.isError ? (
          <p className="settings-inline-error" role="alert">
            Available plans failed to load.
          </p>
        ) : null}
        {usesStripePortal ? (
          <p className="subscription-help-text">
            Use Manage subscription to change billing details.
          </p>
        ) : null}
        {usesStripePortal
          ? null
          : paidPlans.map((plan) => (
              <article className="subscription-plan-card" key={plan.code}>
                <div>
                  <h3>{plan.name}</h3>
                  <p>{plan.active_custom_metric_limit} custom metrics</p>
                  <p>{formatSyncPolicy(plan)}</p>
                  <PlanCapabilityList plan={plan} />
                </div>
                <ul className="subscription-price-list">
                  {plan.prices.map((price) => (
                    <li key={price.id}>
                      <span>
                        {formatSubscriptionPrice(
                          price.unit_amount,
                          price.currency,
                        )}{" "}
                        / {price.billing_interval}
                      </span>
                      <button
                        type="button"
                        disabled={checkoutMutation.isPending}
                        onClick={() => void handleCheckout(price.id)}
                      >
                        Upgrade to {plan.name} {price.billing_interval}ly
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
      </section>

      {errorMessage ? (
        <p className="settings-inline-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

function SubscriptionLoadingSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="settings-loading-skeleton" role="status">
      <span className="settings-skeleton settings-skeleton-title" />
      <span className="settings-skeleton settings-skeleton-copy" />
      <span className="settings-skeleton settings-skeleton-row" />
      <span className="settings-skeleton settings-skeleton-row" />
    </div>
  );
}

function PlanCapabilityList({ plan }: { plan: SubscriptionPlan }) {
  return (
    <ul aria-label="Plan capabilities" className="subscription-capability-list">
      <li>
        {plan.wearable_connection_limit}{" "}
        {plan.wearable_connection_limit === 1
          ? "wearable connection"
          : "wearable connections"}
      </li>
      <li>
        {plan.analytics_enabled
          ? "Analytics included"
          : "Analytics not included"}
      </li>
      <li>
        {plan.csv_import_enabled
          ? "CSV import included"
          : "CSV import not included"}
      </li>
      <li>
        {plan.csv_export_enabled
          ? "CSV export included"
          : "CSV export not included"}
      </li>
    </ul>
  );
}

function formatSubscriptionStatus(subscription: CurrentSubscription) {
  if (subscription.cancel_at) {
    return "Cancelling";
  }

  return subscription.status
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatSubscriptionPrice(unitAmount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(unitAmount / 100);
}

function formatBillingInterval(interval: string) {
  if (interval === "month") {
    return "Monthly";
  }

  if (interval === "year") {
    return "Yearly";
  }

  return interval;
}

function formatSubscriptionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
