import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const res = await SELF.fetch('https://album.test/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rota /api desconhecida vira 404 padronizado', async () => {
    const res = await SELF.fetch('https://album.test/api/nao-existe')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })
})
