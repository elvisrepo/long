export interface RegisterWebValues {
  email: string
  password: string
}

interface RegisterErrorResponse {
  detail?: string
  email?: string[]
  password?: string[]
}

export async function registerWeb(values: RegisterWebValues): Promise<void> {
  const response = await fetch('/api/auth/register/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(values),
  })

  if (!response.ok) {
    let errorMessage = 'Registration failed'
    

    try {
      const data = (await response.json()) as RegisterErrorResponse
      

      if (data.detail) {
        errorMessage = data.detail
      } else if (data.email?.length) {
        errorMessage = data.email[0]
      } else if (data.password?.length) {
        errorMessage = data.password[0]
      }
    } catch {
      // Keep fallback error when the backend response is not JSON.
    }

    throw new Error(errorMessage)
  }
}
