import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { setupSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { users } from '../db/schema'
import { hashPassword, newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '../lib/sessions'

export const setupRoutes = new Hono<AppEnv>()

setupRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const anyUser = await db.select({ id: users.id }).from(users).limit(1)
  return c.json({ needed: anyUser.length === 0 })
})

setupRoutes.post(
  '/',
  zValidator('json', setupSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const anyUser = await db.select({ id: users.id }).from(users).limit(1)
    if (anyUser.length > 0) return apiError(c, 409, 'already_set_up', 'Setup já foi concluído')

    const { name, email, password, spaceName } = c.req.valid('json')
    const nowMs = Date.now()
    const userId = newId()
    const spaceId = newId()
    const passwordHash = await hashPassword(password)

    // Atomic batch: guarded users insert + spaces + space_members
    // If any other request already inserted a user, the FK on space_members will fail and roll back
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO users (id, name, email, password_hash, created_at)
           SELECT ?, ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM users)`,
        ).bind(userId, name, email, passwordHash, nowMs),
        c.env.DB.prepare(
          `INSERT INTO spaces (id, name, created_at)
           VALUES (?, ?, ?)`,
        ).bind(spaceId, spaceName, nowMs),
        c.env.DB.prepare(
          `INSERT INTO space_members (space_id, user_id, role, joined_at)
           VALUES (?, ?, ?, ?)`,
        ).bind(spaceId, userId, 'owner', nowMs),
      ])
    } catch (err) {
      // FK constraint failed on space_members (user wasn't inserted, race lost)
      if (err instanceof Error && err.message.includes('FOREIGN KEY')) {
        return apiError(c, 409, 'already_set_up', 'Setup já foi concluído')
      }
      throw err
    }

    const { token, expiresAt } = await createSession(db, userId)
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return c.json(
      {
        user: { id: userId, name, email },
        space: { id: spaceId, name: spaceName, role: 'owner' as const },
      },
      201,
    )
  },
)
