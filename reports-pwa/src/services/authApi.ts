// Auth API Service for external authentication
// Connects to the POS Auth API server

export interface AuthUser {
  id: number
  name: string
  username: string
  role: string
  email: string
  phone: string
  token: string
}

export interface AuthResponse {
  success: boolean
  message?: string
  data?: AuthUser
  error?: string
}

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || ''

class AuthApiService {
  private baseUrl: string

  constructor() {
    this.baseUrl = AUTH_API_URL
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Add auth token if available
    const token = this.getToken()
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  // Login with username and password
  async login(username: string, password: string): Promise<AuthUser> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Login failed')
    }

    // Store token and user data
    this.setToken(response.data.token)
    this.setUser(response.data)

    return response.data
  }

  // Login with PIN
  async loginWithPIN(pin: string): Promise<AuthUser> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    })

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Login failed')
    }

    // Store token and user data
    this.setToken(response.data.token)
    this.setUser(response.data)

    return response.data
  }

  // Validate current token
  async validateToken(): Promise<AuthUser | null> {
    const token = this.getToken()
    if (!token) {
      return null
    }

    try {
      const response = await this.request<AuthResponse>('/api/v1/auth/validate', {
        method: 'POST',
      })

      if (!response.success || !response.data) {
        this.logout()
        return null
      }

      return response.data
    } catch {
      this.logout()
      return null
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getToken()
  }

  // Get current user from localStorage
  getUser(): AuthUser | null {
    const userJson = localStorage.getItem('auth_user')
    if (userJson) {
      try {
        return JSON.parse(userJson)
      } catch {
        return null
      }
    }
    return null
  }

  // Get token from localStorage
  getToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  // Set token in localStorage
  private setToken(token: string): void {
    localStorage.setItem('auth_token', token)
  }

  // Set user in localStorage
  private setUser(user: AuthUser): void {
    localStorage.setItem('auth_user', JSON.stringify(user))
  }

  // Logout - clear stored data
  logout(): void {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
  }

  // Check API health
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.request<{ success: boolean }>('/health')
      return response.success
    } catch {
      return false
    }
  }
}

export const authApiService = new AuthApiService()
export default authApiService
