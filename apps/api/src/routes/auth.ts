import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { loginSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { spaceMembers, spaces, users } from '../db/schema'
import { verifyPassword } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'
import {
  SESSION_COOKIE,
  createSession,
  deleteSessionByToken,
  sessionCookieOptions,
} from '../lib/sessions'

export const authRoutes = new Hono<AppEnv>()

authRoutes.post(
  '/login',
  zValidator('json', loginSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const { email, password } = c.req.valid('json')
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        spaceId: spaceMembers.spaceId,
        role: spaceMembers.role,
        spaceName: spaces.name,
      })
      .from(users)
      .innerJoin(spaceMembers, eq(spaceMembers.userId, users.id))
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(eq(users.email, email))
      .limit(1)

    const ok = row && (await verifyPassword(password, row.passwordHash))
    if (!ok) return apiError(c, 401, 'invalid_credentials', 'E-mail ou senha incorretos')

    const { token, expiresAt } = await createSession(db, row.id)
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return c.json({
      user: { id: row.id, name: row.name, email: row.email },
      space: { id: row.spaceId, name: row.spaceName, role: row.role },
    })
  },
)

authRoutes.post('/logout', requireAuth, async (c) => {
  await deleteSessionByToken(getDb(c.env.DB), c.get('sessionToken'))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.body(null, 204)
})

authRoutes.get('/me', requireAuth, async (c) => {
  const db = getDb(c.env.DB)
  const membership = c.get('membership')
  const [space] = await db
    .select({ name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, membership.spaceId))
    .limit(1)
  return c.json({
    user: c.get('user'),
    space: { id: membership.spaceId, name: space?.name ?? '', role: membership.role },
  })
})
