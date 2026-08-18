import type { ApiSpace, ApiUser } from '@photo-album/shared'
import { apiFetch, postJson } from './client'

export interface Session {
  user: ApiUser
  space: ApiSpace
}

export function login(data: { email: string; password: string }): Promise<Session> {
  return postJson<Session>('/api/auth/login', data)
}

export function logout(): Promise<void> {
  return postJson<void>('/api/auth/logout', {})
}

export function fetchMe(): Promise<Session> {
  return apiFetch<Session>('/api/auth/me')
}
