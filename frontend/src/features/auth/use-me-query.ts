import { useQuery } from '@tanstack/react-query'

import { getMe } from './auth-me-api'

export function useMeQuery() {
    return useQuery({
      queryKey: ['me'],
      queryFn: getMe,
    })
  }