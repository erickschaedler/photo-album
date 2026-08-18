import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { apiError } from '../lib/errors'
import { SESSION_COOKIE, validateSessionToken } from '../lib/sessions'

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return apiError(c, 401, 'unauthorized', 'Sessão ausente')
  const info = await validateSessionToken(getDb(c.env.DB), token)
  if (!info) return apiError(c, 401, 'unauthorized', 'Sessão inválida ou expirada')
  c.set('user', info.user)
  c.set('membership', info.membership)
  c.set('sessionToken', token)
  await next()
})
