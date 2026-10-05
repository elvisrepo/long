import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";

import { AuthBootstrapGate } from "./features/auth/auth-bootstrap-gate";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/dm-sans/wght-italic.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";
import "./index.css";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthBootstrapGate>
          <RouterProvider router={router} />
        </AuthBootstrapGate>
      </QueryClientProvider>
    </StrictMode>,
  );
}
