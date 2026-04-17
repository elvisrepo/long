import { setAccessToken } from './auth-session'

  interface RestoreWebSessionResponse {
    access: string
  }

  function getCookie(name: string): string | null {
    const cookie = document.cookie
      .split('; ')
      .find((value) => value.startsWith(`${name}=`))

    return cookie ? cookie.slice(name.length + 1) : null
  }

  export async function restoreWebSession(): Promise<RestoreWebSessionResponse> {
    await fetch('/api/auth/csrf/', {
      method: 'GET',
      credentials: 'include',
    })

    const csrfToken = getCookie('csrftoken')

    const response = await fetch('/api/auth/web/refresh/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRFToken': csrfToken ?? '',
      },
    })

    const result = (await response.json()) as RestoreWebSessionResponse

    setAccessToken(result.access)

    return result
  }