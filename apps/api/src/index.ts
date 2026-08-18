import { Hono } from 'hono'
import { apiError } from './lib/errors'
import { authRoutes } from './routes/auth'
import { setupRoutes } from './routes/setup'
import { inviteRoutes } from './routes/invites'
import { albumRoutes } from './routes/albums'

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

app.route('/api/auth', authRoutes)
app.route('/api/setup', setupRoutes)
app.route('/api/invites', inviteRoutes)
app.route('/api/albums', albumRoutes)

app.notFound((c) => apiError(c, 404, 'not_found', 'Recurso não encontrado'))

app.onError((err, c) => {
  console.error('unhandled error', err)
  return apiError(c, 500, 'internal_error', 'Erro interno')
})

export default app
