import { createContext, useContext, useState, type ReactNode } from 'react'
import { AUTH_TOKEN_STORAGE_KEY } from '../api/client'

type Role = 'USER' | 'ADMIN'

interface AuthUser {
  token: string
  userId: string
  username: string
  role: Role
}

interface AuthContextValue {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
}

const USER_ID_STORAGE_KEY = 'panteon.userId'
const USERNAME_STORAGE_KEY = 'panteon.username'
const ROLE_STORAGE_KEY = 'panteon.role'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function getStoredUser(): AuthUser | null {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  const userId = localStorage.getItem(USER_ID_STORAGE_KEY)
  const username = localStorage.getItem(USERNAME_STORAGE_KEY)
  const role = localStorage.getItem(ROLE_STORAGE_KEY)

  if (!token || !userId || !username || (role !== 'USER' && role !== 'ADMIN')) {
    return null
  }

  return { token, userId, username, role }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)

  const login = (nextUser: AuthUser) => {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextUser.token)
    localStorage.setItem(USER_ID_STORAGE_KEY, nextUser.userId)
    localStorage.setItem(USERNAME_STORAGE_KEY, nextUser.username)
    localStorage.setItem(ROLE_STORAGE_KEY, nextUser.role)
    setUser(nextUser)
  }

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_ID_STORAGE_KEY)
    localStorage.removeItem(USERNAME_STORAGE_KEY)
    localStorage.removeItem(ROLE_STORAGE_KEY)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
