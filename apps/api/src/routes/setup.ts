import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { setupSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { spaceMembers, spaces, users } from '../db/schema'
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
    const now = new Date()
    const userId = newId()
    const spaceId = newId()
    await db.insert(users).values({
      id: userId,
      name,
      email,
      passwordHash: await hashPassword(password),
      createdAt: now,
    })
    await db.insert(spaces).values({ id: spaceId, name: spaceName, createdAt: now })
    await db.insert(spaceMembers).values({ spaceId, userId, role: 'owner', joinedAt: now })

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
