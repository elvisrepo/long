import { render } from "@testing-library/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";

import { routeTree } from "../routeTree.gen";

export function renderRoute(path: string) {
  window.history.pushState({}, "", path);

  const router = createRouter({ routeTree });

  return render(<RouterProvider router={router} />);
}
