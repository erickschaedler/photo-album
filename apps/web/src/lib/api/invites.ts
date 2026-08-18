import { apiFetch, postJson } from './client'
import type { Session } from './auth'

export function createInvite(): Promise<{ token: string; url: string; expiresAt: number }> {
  return postJson('/api/invites', {})
}

export function fetchInvite(token: string): Promise<{ spaceName: string; inviterName: string }> {
  return apiFetch(`/api/invites/${token}`)
}

export function acceptInvite(
  token: string,
  data: { name: string; email: string; password: string },
): Promise<Session> {
  return postJson<Session>(`/api/invites/${token}/accept`, data)
}
