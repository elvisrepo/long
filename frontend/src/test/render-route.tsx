import { render } from "@testing-library/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { routeTree } from "../routeTree.gen";

export function renderRoute(path: string) {
  window.history.pushState({}, "", path);

  const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

  const router = createRouter({ routeTree });

  return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
}
