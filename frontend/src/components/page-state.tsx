import { Link } from "@tanstack/react-router";

export function PageState({
  message,
  error = false,
  notFound = false,
}: {
  message: string;
  error?: boolean;
  notFound?: boolean;
}) {
  return (
    <section className="page-state" aria-busy={!error && !notFound}>
      <p role={error ? "alert" : notFound ? undefined : "status"}>{message}</p>
      {notFound ? (
        <Link className="insights-action-link" to="/metrics">
          Browse metrics →
        </Link>
      ) : null}
    </section>
  );
}
