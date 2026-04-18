import { clearAccessToken } from "./auth-session"

interface ErrorResponse {
    detail?: string
}


function getCookie(name: string): string | null {
    const cookie = document.cookie
      .split('; ')
      .find((value) => value.startsWith(`${name}=`))

    return cookie ? cookie.slice(name.length + 1) : null
  }

  export async function logoutWeb(): Promise<void> {
    const csrfToken = getCookie('csrftoken')

    const response = await fetch('/api/auth/web/logout/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRFToken': csrfToken ?? '',
      },
    })

    if (!response.ok) {
      let errorMessage = 'Logout failed'

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

    clearAccessToken()
  }