import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { sessions, spaceMembers, users } from '../db/schema'
import { generateToken, newId, sha256Hex } from './crypto'

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000

export interface SessionInfo {
  user: { id: string; name: string; email: string }
  membership: { spaceId: string; role: 'owner' | 'member' }
  renewedExpiresAt?: Date
}

export async function createSession(db: Db, userId: string) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({
    id: newId(),
    tokenHash: await sha256Hex(token),
    userId,
    expiresAt,
    createdAt: new Date(),
  })
  return { token, expiresAt }
}

export async function validateSessionToken(db: Db, token: string): Promise<SessionInfo | null> {
  const tokenHash = await sha256Hex(token)
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      spaceId: spaceMembers.spaceId,
      role: spaceMembers.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(spaceMembers, eq(spaceMembers.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  if (!row) return null
  const now = Date.now()
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId))
    return null
  }
  let renewedExpiresAt: Date | undefined
  if (row.expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS) {
    renewedExpiresAt = new Date(now + SESSION_TTL_MS)
    await db
      .update(sessions)
      .set({ expiresAt: renewedExpiresAt })
      .where(eq(sessions.id, row.sessionId))
  }
  return {
    user: { id: row.userId, name: row.name, email: row.email },
    membership: { spaceId: row.spaceId, role: row.role },
    ...(renewedExpiresAt ? { renewedExpiresAt } : {}),
  }
}

export async function deleteSessionByToken(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)))
}

export function sessionCookieOptions(expiresAt: Date) {
  return { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/', expires: expiresAt }
}
