import { apiFetch, postJson } from './client'
import type { Session } from './auth'

export function fetchSetupStatus(): Promise<{ needed: boolean }> {
  return apiFetch<{ needed: boolean }>('/api/setup')
}

export function runSetup(data: {
  name: string
  email: string
  password: string
  spaceName: string
}): Promise<Session> {
  return postJson<Session>('/api/setup', data)
}
