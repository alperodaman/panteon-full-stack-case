import ky from 'ky'

export const AUTH_TOKEN_STORAGE_KEY = 'panteon.token'

export const apiClient = ky.create({
  baseUrl: import.meta.env.VITE_API_URL,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
  },
})
