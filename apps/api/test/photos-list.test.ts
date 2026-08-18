import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, getJson, postJson, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'
import { decodeCursor, encodeCursor } from '../src/lib/cursor'

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

describe('cursor', () => {
  it('roundtrip e decode de lixo → null', () => {
    const c = encodeCursor(1700000000000, 'abc')
    expect(decodeCursor(c)).toEqual({ takenAt: 1700000000000, id: 'abc' })
    expect(decodeCursor('%%%nao-e-base64%%%')).toBeNull()
    expect(decodeCursor(btoa('{"nao":"array"}'))).toBeNull()
  })
})

describe('GET /api/photos', () => {
  it('pagina por takenAt desc com cursor e termina com nextCursor null', async () => {
    const { cookie } = await setupSpace()
    for (let i = 1; i <= 5; i++) await uploadPhoto(cookie, { takenAt: 1700000000000 + i * 1000 })

    const p1 = await getJson('/api/photos?limit=2', cookie)
    const page1 = (await p1.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page1.items.map((p) => p.takenAt)).toEqual([1700000005000, 1700000004000])
    expect(page1.nextCursor).not.toBeNull()

    const p2 = await getJson(`/api/photos?limit=2&cursor=${page1.nextCursor}`, cookie)
    const page2 = (await p2.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page2.items.map((p) => p.takenAt)).toEqual([1700000003000, 1700000002000])

    const p3 = await getJson(`/api/photos?limit=2&cursor=${page2.nextCursor}`, cookie)
    const page3 = (await p3.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page3.items.map((p) => p.takenAt)).toEqual([1700000001000])
    expect(page3.nextCursor).toBeNull()
  })

  it('desempata por id quando takenAt é igual (sem pular nem repetir)', async () => {
    const { cookie } = await setupSpace()
    for (let i = 0; i < 4; i++) await uploadPhoto(cookie, { takenAt: 1700000000000 })
    const p1 = await getJson('/api/photos?limit=3', cookie)
    const page1 = (await p1.json()) as { items: { id: string }[]; nextCursor: string | null }
    const p2 = await getJson(`/api/photos?limit=3&cursor=${page1.nextCursor}`, cookie)
    const page2 = (await p2.json()) as { items: { id: string }[] }
    const ids = [...page1.items, ...page2.items].map((p) => p.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('filtra por albumId; cursor inválido → 400; isolamento entre espaços', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'A' }, cookie)
    const album = (await created.json()) as { id: string }
    await uploadPhoto(cookie, { albumId: album.id })
    await uploadPhoto(cookie)

    const filtered = await getJson(`/api/photos?albumId=${album.id}`, cookie)
    expect(((await filtered.json()) as { items: unknown[] }).items).toHaveLength(1)

    expect((await getJson('/api/photos?cursor=@@@', cookie)).status).toBe(400)

    const intruder = await createSecondSpace()
    const other = await getJson('/api/photos', intruder.cookie)
    expect(((await other.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it('albumId vazio na query → 400 (não vira "sem filtro")', async () => {
    const { cookie } = await setupSpace()
    const res = await getJson('/api/photos?albumId=', cookie)
    expect(res.status).toBe(400)
  })
})

describe('PATCH e DELETE /api/photos/:id', () => {
  it('move para álbum e de volta para null', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'A' }, cookie)
    const album = (await created.json()) as { id: string }
    const photo = await uploadPhoto(cookie)

    const moved = await patchJson(`/api/photos/${photo.id}`, { albumId: album.id }, cookie)
    expect(((await moved.json()) as { albumId: string | null }).albumId).toBe(album.id)
    const back = await patchJson(`/api/photos/${photo.id}`, { albumId: null }, cookie)
    expect(((await back.json()) as { albumId: string | null }).albumId).toBeNull()
  })

  it('albumId vazio no PATCH → 400 (não bypassa validação do álbum)', async () => {
    const { cookie } = await setupSpace()
    const photo = await uploadPhoto(cookie)
    const res = await patchJson(`/api/photos/${photo.id}`, { albumId: '' }, cookie)
    expect(res.status).toBe(400)
  })

  it('DELETE apaga linha e objetos do R2; intruso recebe 404 e nada muda', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie)
    const keys = photoKeys(spaceId, photo.id)

    const intruder = await createSecondSpace()
    expect((await del(`/api/photos/${photo.id}`, intruder.cookie)).status).toBe(404)
    expect(await env.PHOTOS.get(keys.file)).not.toBeNull()

    expect((await del(`/api/photos/${photo.id}`, cookie)).status).toBe(204)
    expect(await env.PHOTOS.get(keys.file)).toBeNull()
    expect(await env.PHOTOS.get(keys.thumb)).toBeNull()
    const list = await getJson('/api/photos', cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it('DELETE de foto que é capa de álbum limpa coverPhotoId', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'A' }, cookie)
    const album = (await created.json()) as { id: string }
    const photo = await uploadPhoto(cookie)

    const withCover = await patchJson(`/api/albums/${album.id}`, { coverPhotoId: photo.id }, cookie)
    expect(((await withCover.json()) as { coverPhotoId: string | null }).coverPhotoId).toBe(
      photo.id,
    )

    expect((await del(`/api/photos/${photo.id}`, cookie)).status).toBe(204)

    const albumsRes = await getJson('/api/albums', cookie)
    const { items } = (await albumsRes.json()) as {
      items: { id: string; coverPhotoId: string | null }[]
    }
    const updatedAlbum = items.find((a) => a.id === album.id)
    expect(updatedAlbum?.coverPhotoId).toBeNull()
  })
})
