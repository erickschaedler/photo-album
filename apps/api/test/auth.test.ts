import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../src/db'
import { sessions } from '../src/db/schema'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

describe('auth', () => {
  it('login com credenciais corretas devolve user+space e cookie válido', async () => {
    await setupSpace()
    const res = await postJson('/api/auth/login', {
      email: 'Erick@X.co',
      password: 'senha-do-erick',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { email: string }; space: { role: string } }
    expect(body.user.email).toBe('erick@x.co')
    expect(body.space.role).toBe('owner')

    const cookie = extractSessionCookie(res)
    const me = await getJson('/api/auth/me', cookie)
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as { user: { email: string } }
    expect(meBody.user.email).toBe('erick@x.co')
  })

  it('senha errada e e-mail inexistente → 401 invalid_credentials idênticos', async () => {
    await setupSpace()
    const wrongPass = await postJson('/api/auth/login', {
      email: 'erick@x.co',
      password: 'senha-errada',
    })
    const noUser = await postJson('/api/auth/login', {
      email: 'nao-existe@x.co',
      password: 'tanto-faz',
    })
    expect(wrongPass.status).toBe(401)
    expect(noUser.status).toBe(401)
    expect(await wrongPass.json()).toEqual(await noUser.json())
  })

  it('/api/auth/me sem cookie → 401 unauthorized', async () => {
    await setupSpace()
    const res = await getJson('/api/auth/me')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unauthorized')
  })

  it('logout invalida a sessão', async () => {
    const { cookie } = await setupSpace()
    const out = await postJson('/api/auth/logout', {}, cookie)
    expect(out.status).toBe(204)
    const me = await getJson('/api/auth/me', cookie)
    expect(me.status).toBe(401)
  })
})

describe('renovação deslizante re-emite o cookie', () => {
  it('sessão perto de expirar → GET /api/auth/me devolve set-cookie com validade nova', async () => {
    const { cookie } = await setupSpace()
    const db = getDb(env.DB)
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.update(sessions).set({ expiresAt: soon })

    const res = await getJson('/api/auth/me', cookie)
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(cookie) // mesmo token: "session=<token>"
    expect(setCookie).toContain('HttpOnly')
    const expires = new Date(/expires=([^;]+)/i.exec(setCookie)![1]!)
    expect(expires.getTime()).toBeGreaterThan(soon.getTime())
  })

  it('sessão recém-criada → sem set-cookie no /me', async () => {
    const { cookie } = await setupSpace()
    const res = await getJson('/api/auth/me', cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
