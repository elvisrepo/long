import type { ReactNode } from 'react'

import { Navigate } from '@tanstack/react-router'

import type { CurrentUser } from './auth-me-api'
import { useMeQuery } from './use-me-query'

interface RequireAuthProps {
  children: (currentUser: CurrentUser) => ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const meQuery = useMeQuery()

  if (meQuery.isLoading) {
    return <p>Loading...</p>
  }

  if (meQuery.isError || !meQuery.data) {
    return <Navigate to="/login" />
  }

  return children(meQuery.data)
}
