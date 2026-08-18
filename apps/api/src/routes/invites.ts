import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { acceptInviteSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb, type Db } from '../db'
import { invites, spaceMembers, spaces, users } from '../db/schema'
import { generateToken, hashPassword, newId, sha256Hex } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '../lib/sessions'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const inviteRoutes = new Hono<AppEnv>()

inviteRoutes.post('/', requireAuth, async (c) => {
  const membership = c.get('membership')
  if (membership.role !== 'owner')
    return apiError(c, 403, 'forbidden', 'Só o dono do espaço convida')

  const db = getDb(c.env.DB)
  const token = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.insert(invites).values({
    id: newId(),
    tokenHash: await sha256Hex(token),
    spaceId: membership.spaceId,
    createdBy: c.get('user').id,
    expiresAt,
  })
  return c.json({ token, url: `/invite/${token}`, expiresAt: expiresAt.getTime() }, 201)
})

async function findValidInvite(db: Db, token: string) {
  const tokenHash = await sha256Hex(token)
  const [row] = await db
    .select({
      id: invites.id,
      spaceId: invites.spaceId,
      spaceName: spaces.name,
      inviterName: users.name,
    })
    .from(invites)
    .innerJoin(spaces, eq(spaces.id, invites.spaceId))
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return row
}

inviteRoutes.get('/:token', async (c) => {
  const row = await findValidInvite(getDb(c.env.DB), c.req.param('token'))
  if (!row) return apiError(c, 404, 'not_found', 'Convite inválido ou expirado')
  return c.json({ spaceName: row.spaceName, inviterName: row.inviterName })
})

inviteRoutes.post(
  '/:token/accept',
  zValidator('json', acceptInviteSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const row = await findValidInvite(db, c.req.param('token'))
    if (!row) return apiError(c, 404, 'not_found', 'Convite inválido ou expirado')

    const { name, email, password } = c.req.valid('json')
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (existing.length > 0) return apiError(c, 409, 'email_in_use', 'E-mail já cadastrado')

    const now = new Date()
    const claim = await db
      .update(invites)
      .set({ usedAt: now })
      .where(and(eq(invites.id, row.id), isNull(invites.usedAt)))
    if (claim.meta.changes === 0)
      return apiError(c, 404, 'not_found', 'Convite inválido ou expirado')

    const userId = newId()
    try {
      await db.insert(users).values({
        id: userId,
        name,
        email,
        passwordHash: await hashPassword(password),
        createdAt: now,
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        await db.update(invites).set({ usedAt: null }).where(eq(invites.id, row.id))
        return apiError(c, 409, 'email_in_use', 'E-mail já cadastrado')
      }
      throw err
    }

    await db
      .insert(spaceMembers)
      .values({ spaceId: row.spaceId, userId, role: 'member', joinedAt: now })

    const { token: session, expiresAt } = await createSession(db, userId)
    setCookie(c, SESSION_COOKIE, session, sessionCookieOptions(expiresAt))
    return c.json(
      {
        user: { id: userId, name, email },
        space: { id: row.spaceId, name: row.spaceName, role: 'member' as const },
      },
      201,
    )
  },
)
