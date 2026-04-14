import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

const RootLayout = () => (
  <>
    <header className="p-4">
      <nav className="flex gap-4">
        <Link to="/" className="[&.active]:font-bold">
          Dashboard
        </Link>
        <Link to="/login" className="[&.active]:font-bold">
          Login
        </Link>
        <Link to="/register" className="[&.active]:font-bold">
          Register
        </Link>
        <Link to="/settings" className="[&.active]:font-bold">
          Settings
        </Link>
      </nav>
    </header>
    <hr />
    <main className="p-4">
      <Outlet />
    </main>
    <TanStackRouterDevtools />
  </>
);

export const Route = createRootRoute({ component: RootLayout });
