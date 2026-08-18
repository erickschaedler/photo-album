import { describe, expect, it } from 'vitest'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

describe('setup', () => {
  it('GET /api/setup indica needed=true com banco vazio e false depois', async () => {
    const before = await getJson('/api/setup')
    expect(await before.json()).toEqual({ needed: true })
    await setupSpace()
    const after = await getJson('/api/setup')
    expect(await after.json()).toEqual({ needed: false })
  })

  it('POST cria user+space+sessão e o cookie autentica', async () => {
    const res = await postJson('/api/setup', {
      name: 'Erick',
      email: 'Erick@X.co',
      password: 'senha-do-erick',
      spaceName: 'Nós dois',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      user: { id: string; email: string }
      space: { id: string; name: string; role: string }
    }
    expect(body.user.email).toBe('erick@x.co')
    expect(body.space).toMatchObject({ name: 'Nós dois', role: 'owner' })
    expect(extractSessionCookie(res)).toMatch(/^session=/)
  })

  it('segundo setup → 409', async () => {
    await setupSpace()
    const res = await postJson('/api/setup', {
      name: 'X',
      email: 'x@x.co',
      password: 'senha-qualquer',
      spaceName: 'Y',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('already_set_up')
  })

  it('payload inválido → 400 validation_error', async () => {
    const res = await postJson('/api/setup', { name: '', email: 'not-an-email', password: '1' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })
})
