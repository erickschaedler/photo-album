import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../src/db'
import { invites } from '../src/db/schema'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

async function createInvite(cookie: string) {
  const res = await postJson('/api/invites', {}, cookie)
  expect(res.status).toBe(201)
  return (await res.json()) as { token: string; url: string; expiresAt: number }
}

describe('invites', () => {
  it('owner cria convite; GET público mostra espaço e quem convidou', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    expect(inv.url).toBe(`/invite/${inv.token}`)
    expect(inv.expiresAt).toBeGreaterThan(Date.now())

    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(200)
    expect(await info.json()).toEqual({ spaceName: 'Nós dois', inviterName: 'Erick' })
  })

  it('accept cria a segunda conta como member no mesmo espaço e loga', async () => {
    const { cookie, spaceId } = await setupSpace()
    const inv = await createInvite(cookie)
    const res = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'Namorada',
      email: 'ela@x.co',
      password: 'senha-dela-123',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      user: { email: string }
      space: { id: string; role: string }
    }
    expect(body.user.email).toBe('ela@x.co')
    expect(body.space).toMatchObject({ id: spaceId, role: 'member' })

    const her = extractSessionCookie(res)
    const me = await getJson('/api/auth/me', her)
    expect(me.status).toBe(200)
  })

  it('convite é de uso único', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const first = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'A',
      email: 'a1@x.co',
      password: 'senha-123-abc',
    })
    expect(first.status).toBe(201)
    const again = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'B',
      email: 'a2@x.co',
      password: 'senha-123-abc',
    })
    expect(again.status).toBe(404)
    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(404)
  })

  it('convite expirado → 404', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const db = getDb(env.DB)
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) })
    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(404)
  })

  it('member não cria convite (403); sem login, 401; token aleatório, 404', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const accept = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'N',
      email: 'ela@x.co',
      password: 'senha-dela-123',
    })
    const her = extractSessionCookie(accept)

    const asMember = await postJson('/api/invites', {}, her)
    expect(asMember.status).toBe(403)
    const noAuth = await postJson('/api/invites', {})
    expect(noAuth.status).toBe(401)
    const bogus = await getJson('/api/invites/token-que-nao-existe')
    expect(bogus.status).toBe(404)
  })

  it('e-mail já cadastrado no accept → 409 email_in_use', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const res = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'Duplicada',
      email: 'erick@x.co',
      password: 'senha-123-abc',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('email_in_use')
  })
})
