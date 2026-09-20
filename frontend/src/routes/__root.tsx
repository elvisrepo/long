import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useState } from "react";

import { logoutWeb } from "../features/auth/auth-logout-api";
import { useMeQuery } from "../features/auth/use-me-query";

interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isPublicAuthRoute = pathname === "/login" || pathname === "/register";

  return (
    <div className="app-shell">
      {isPublicAuthRoute ? null : (
        <header className="app-header">
          <div className="app-header-inner">
            <Link to="/" className="app-logo">
              ⬡ longevity
            </Link>
            <AppNavigation />
          </div>
        </header>
      )}
      <main className={isPublicAuthRoute ? "app-main auth-main" : "app-main"}>
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  );
}

function AppNavigation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    try {
      setLogoutError("");
      setIsLoggingOut(true);
      await logoutWeb();
      queryClient.removeQueries({ queryKey: ["me"] });
      await navigate({ to: "/login" });
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (!meQuery.data) {
    return (
      <nav className="app-nav" aria-label="Primary navigation">
        <Link to="/login" className="app-nav-link">
          Login
        </Link>
        <Link to="/register" className="app-nav-link">
          Register
        </Link>
      </nav>
    );
  }

  const userInitial = meQuery.data.email.charAt(0).toUpperCase();

  return (
    <div className="app-navigation">
      <nav className="app-nav" aria-label="Primary navigation">
        <Link to="/" className="app-nav-link">
          Dashboard
        </Link>
        <Link to="/metrics" className="app-nav-link">
          Metrics
        </Link>
        <Link to="/settings" search={{}} className="app-nav-link">
          Settings
        </Link>
        <span
          className="user-chip"
          title={`Signed in as ${meQuery.data.email}`}
        >
          {userInitial}
        </span>
        <button
          className="app-nav-action"
          disabled={isLoggingOut}
          type="button"
          onClick={() => void handleLogout()}
        >
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </nav>
      {logoutError ? (
        <p className="app-nav-error" role="alert">
          {logoutError}
        </p>
      ) : null}
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <div>404 Not Found</div>,
});
