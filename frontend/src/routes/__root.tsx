import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useEffect, useRef, useState } from "react";

import { PageHeader } from "../components/page-header";
import { ThemeToggle } from "../components/theme-toggle";
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
      {isPublicAuthRoute ? (
        <div className="auth-theme-bar">
          <ThemeToggle />
        </div>
      ) : (
        <header className="app-header">
          <div className="app-header-inner">
            <Link to="/" className="app-logo">
              ⬡ longevity
            </Link>
            <ThemeToggle />
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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
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

  return (
    <AuthenticatedNavigation
      key={pathname}
      email={meQuery.data.email}
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      onLogout={() => void handleLogout()}
    />
  );
}

function AuthenticatedNavigation({
  email,
  isLoggingOut,
  logoutError,
  onLogout,
}: {
  email: string;
  isLoggingOut: boolean;
  logoutError: string;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const userInitial = email.charAt(0).toUpperCase();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    function closeOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        !navigationRef.current?.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [menuOpen]);

  return (
    <div ref={navigationRef} className="app-navigation has-menu">
      <button
        ref={menuButtonRef}
        aria-controls="primary-navigation"
        aria-expanded={menuOpen}
        className="app-nav-menu-button"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true">☰</span> Menu
      </button>
      <nav
        id="primary-navigation"
        className={`app-nav${menuOpen ? " is-open" : ""}`}
        aria-label="Primary navigation"
      >
        <Link to="/" className="app-nav-link">
          Dashboard
        </Link>
        <Link to="/metrics" className="app-nav-link">
          Metrics
        </Link>
        <Link to="/settings" search={{}} className="app-nav-link">
          Settings
        </Link>
        <span className="user-chip" title={`Signed in as ${email}`}>
          {userInitial}
        </span>
        <button
          className="app-nav-action"
          disabled={isLoggingOut}
          type="button"
          onClick={onLogout}
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
  notFoundComponent: () => (
    <section>
      <PageHeader
        title="Page not found"
        eyebrow="404"
        description="This page may have moved or the link may be incorrect."
        actions={
          <Link className="insights-action-link" to="/">
            Back to dashboard
          </Link>
        }
      />
    </section>
  ),
});
