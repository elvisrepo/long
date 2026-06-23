import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

interface RouterContext {
  queryClient: QueryClient;
}

const RootLayout = () => (
  <div className="app-shell">
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="app-logo">
          ⬡ longevity
        </Link>
        <nav className="app-nav" aria-label="Primary navigation">
          <Link to="/" className="app-nav-link">
            Dashboard
          </Link>
          <Link to="/metrics" className="app-nav-link">
            Metrics
        </Link>
          <Link to="/login" className="app-nav-link">
            Login
          </Link>
          <Link to="/register" className="app-nav-link">
            Register
          </Link>
          <Link to="/settings" search={{}} className="app-nav-link">
            Settings
          </Link>
        </nav>
      </div>
    </header>
    <main className="app-main">
      <Outlet />
    </main>
    <TanStackRouterDevtools />
  </div>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: () => <div>404 Not Found</div>,
});
