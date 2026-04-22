export interface RegisterWebValues {
    email: string
    password: string
  }

interface RegisterErrorResponse {
    detail?: string
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
        }
      } catch {
        // Keep fallback error when the backend response is not JSON.
      }

      throw new Error(errorMessage)
    }
  }