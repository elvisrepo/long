 import { render, screen } from '@testing-library/react'
  import { createRouter, RouterProvider } from '@tanstack/react-router'
  import { describe, expect, it } from 'vitest'

  import { routeTree } from '../routeTree.gen'

  describe('dashboard route', () => {
    it('renders the dashboard heading at /', async () => {
        // tell the router “pretend the current page is this URL”
        window.history.pushState({}, '', '/')

      const router = createRouter({ routeTree })

      render(<RouterProvider router={router} />)

      expect(
        await screen.findByRole('heading', { name: /dashboard/i }),
      ).toBeInTheDocument()
    })
  })