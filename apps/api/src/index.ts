import { Hono } from 'hono'
import { apiError } from './lib/errors'

export interface AppVariables {
  user: { id: string; name: string; email: string }
  membership: { spaceId: string; role: 'owner' | 'member' }
  sessionToken: string
}

export type AppEnv = {
  Bindings: { DB: D1Database; PHOTOS: R2Bucket }
  Variables: AppVariables
}

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.notFound((c) => apiError(c, 404, 'not_found', 'Recurso não encontrado'))

app.onError((err, c) => {
  console.error('unhandled error', err)
  return apiError(c, 500, 'internal_error', 'Erro interno')
})

export default app
