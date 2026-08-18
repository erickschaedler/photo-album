import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, getJson, postJson, setupSpace } from './helpers'

function patchJson(path: string, body: unknown, cookie: string) {
  return SELF.fetch('https://album.test' + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function del(path: string, cookie: string) {
  return SELF.fetch('https://album.test' + path, { method: 'DELETE', headers: { cookie } })
}

describe('albums', () => {
  it('cria, lista e edita álbum', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Viagem à praia' }, cookie)
    expect(created.status).toBe(201)
    const album = (await created.json()) as { id: string; title: string; photoCount: number }
    expect(album).toMatchObject({ title: 'Viagem à praia', photoCount: 0 })

    const list = await getJson('/api/albums', cookie)
    const body = (await list.json()) as { items: { id: string }[] }
    expect(body.items.map((a) => a.id)).toEqual([album.id])

    const patched = await patchJson(`/api/albums/${album.id}`, { title: 'Praia 2026' }, cookie)
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { title: string }).title).toBe('Praia 2026')
  })

  it('DELETE remove o álbum', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Temporário' }, cookie)
    const album = (await created.json()) as { id: string }
    expect((await del(`/api/albums/${album.id}`, cookie)).status).toBe(204)
    const list = await getJson('/api/albums', cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it('isolamento: espaço B não vê nem altera álbum do espaço A', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Nosso' }, cookie)
    const album = (await created.json()) as { id: string }

    const intruder = await createSecondSpace()
    const list = await getJson('/api/albums', intruder.cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
    expect(
      (await patchJson(`/api/albums/${album.id}`, { title: 'hack' }, intruder.cookie)).status,
    ).toBe(404)
    expect((await del(`/api/albums/${album.id}`, intruder.cookie)).status).toBe(404)
  })

  it('coverPhotoId de outro espaço → 400', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Capa' }, cookie)
    const album = (await created.json()) as { id: string }
    const res = await patchJson(
      `/api/albums/${album.id}`,
      { coverPhotoId: 'foto-inexistente' },
      cookie,
    )
    expect(res.status).toBe(400)
  })

  it('coverPhotoId vazio (string vazia) → 400', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Capa vazia' }, cookie)
    const album = (await created.json()) as { id: string }
    const res = await patchJson(`/api/albums/${album.id}`, { coverPhotoId: '' }, cookie)
    expect(res.status).toBe(400)
  })

  it('sem sessão → 401', async () => {
    expect((await getJson('/api/albums')).status).toBe(401)
  })
})
