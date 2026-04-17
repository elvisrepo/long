import { clearAccessToken, setAccessToken } from './auth-session'

  interface RestoreWebSessionResponse {
    access: string
  }

  interface ErrorResponse {
    detail?: string
  }

  function getCookie(name: string): string | null {
    const cookie = document.cookie
      .split('; ')
      .find((value) => value.startsWith(`${name}=`))

    return cookie ? cookie.slice(name.length + 1) : null
  }

  export async function restoreWebSession(): Promise<RestoreWebSessionResponse> {
    const csrfResponse = await fetch('/api/auth/csrf/', {
      method: 'GET',
      credentials: 'include',
    })

    if (!csrfResponse.ok) {
      clearAccessToken()
      throw new Error('Session restore failed')
    }

    const csrfToken = getCookie('csrftoken')

    const response = await fetch('/api/auth/web/refresh/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRFToken': csrfToken ?? '',
      },
    })

    if (!response.ok) {
      clearAccessToken()

      let errorMessage = 'Session restore failed'

      try {
        const errorData = (await response.json()) as ErrorResponse

        if (errorData.detail) {
          errorMessage = errorData.detail
        }
      } catch {
        // Keep fallback error
      }

      throw new Error(errorMessage)
    }

    const result = (await response.json()) as RestoreWebSessionResponse

    setAccessToken(result.access)

    return result
  }
