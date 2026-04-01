import { create } from 'zustand'
import type { User } from '../types'
import { authApi } from '../lib/api'

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  checked: boolean

  login: (email: string, password: string) => Promise<boolean>
  register: (email: string, password: string, name?: string) => Promise<boolean>
  logout: () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('vibeos_token'),
  loading: false,
  error: null,
  checked: false,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { token, user } = await authApi.login(email, password)
      localStorage.setItem('vibeos_token', token)
      set({ user, token, loading: false, checked: true })
      return true
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Login failed' })
      return false
    }
  },

  register: async (email, password, name) => {
    set({ loading: true, error: null })
    try {
      const { token, user } = await authApi.register(email, password, name)
      localStorage.setItem('vibeos_token', token)
      set({ user, token, loading: false, checked: true })
      return true
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Registration failed' })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('vibeos_token')
    set({ user: null, token: null })
  },

  restoreSession: async () => {
    const token = localStorage.getItem('vibeos_token')
    if (!token) { set({ checked: true }); return }
    try {
      const user = await authApi.me()
      set({ user, token, checked: true })
    } catch {
      localStorage.removeItem('vibeos_token')
      set({ user: null, token: null, checked: true })
    }
  },
}))
