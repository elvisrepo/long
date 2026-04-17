import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { restoreWebSession } from './auth-bootstrap'

interface AuthBootstrapGateProps {
  children: ReactNode
}

export function AuthBootstrapGate({ children }: AuthBootstrapGateProps) {
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function bootstrapSession() {
      try {
        await restoreWebSession()
      } catch {
        // Startup should continue even when no restorable session exists.
      } finally {
        if (isMounted) {
          setIsBootstrapping(false)
        }
      }
    }

    void bootstrapSession()

    return () => {
      isMounted = false
    }
  }, [])

  if (isBootstrapping) {
    return <p>Restoring session...</p>
  }

  return <>{children}</>
  }
