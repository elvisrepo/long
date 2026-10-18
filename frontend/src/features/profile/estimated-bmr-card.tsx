import { Link } from "@tanstack/react-router";
import { usePersonalInfoQuery } from "./use-personal-info-query";
import { EstimatedBmrSummary } from "./estimated-bmr-summary";

export function EstimatedBmrCard() {
  const query = usePersonalInfoQuery();
  return (
    <article
      className="metric-card"
      data-category="body_composition"
      data-metric="estimated_bmr"
      aria-label="Estimated BMR"
    >
      <div className="metric-card-header">
        <span className="metric-card-symbol" aria-hidden="true">
          ≈
        </span>
        <h2>
          <Link
            className="metric-card-link"
            to="/settings"
            search={{}}
            hash="personal-info"
          >
            Estimated BMR <span aria-hidden="true">↗</span>
          </Link>
        </h2>
      </div>
      {query.isPending ? (
        <p className="metric-meta">Loading estimate…</p>
      ) : query.isError ? (
        <div>
          <p className="metric-meta">Estimate unavailable</p>
          <button type="button" onClick={() => void query.refetch()}>
            Retry estimate
          </button>
        </div>
      ) : (
        <EstimatedBmrSummary estimate={query.data.estimated_bmr} />
      )}
    </article>
  );
}
