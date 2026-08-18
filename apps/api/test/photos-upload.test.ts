import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, postJson, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'

describe('POST /api/photos', () => {
  it('grava arquivo+thumb no R2 e metadados no D1', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie, { takenAt: 1700000000000 })
    expect(photo).toMatchObject({
      albumId: null,
      mime: 'image/jpeg',
      width: 2560,
      height: 1440,
      takenAt: 1700000000000,
    })
    expect(photo.sizeBytes).toBe(7)

    const keys = photoKeys(spaceId, photo.id)
    const original = await env.PHOTOS.get(keys.file)
    const thumb = await env.PHOTOS.get(keys.thumb)
    expect(original).not.toBeNull()
    expect(thumb).not.toBeNull()
    expect(original!.httpMetadata?.contentType).toBe('image/jpeg')
  })

  it('sem takenAt usa horário do upload; albumId válido associa', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Álbum' }, cookie)
    const album = (await created.json()) as { id: string }
    const before = Date.now()
    const photo = await uploadPhoto(cookie, { albumId: album.id })
    expect(photo.takenAt).toBeGreaterThanOrEqual(before)
    expect(photo.albumId).toBe(album.id)
  })

  it('mime não permitido → 400 unsupported_media', async () => {
    const { cookie } = await setupSpace()
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1])], 'x.gif', { type: 'image/gif' }))
    form.set('thumb', new File([new Uint8Array([1])], 't.gif', { type: 'image/gif' }))
    form.set('width', '10')
    form.set('height', '10')
    const res = await SELF.fetch('https://album.test/api/photos', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unsupported_media')
  })

  it('multipart sem file → 400; albumId de outro espaço → 400; sem sessão → 401', async () => {
    const { cookie } = await setupSpace()
    const form = new FormData()
    form.set('width', '10')
    form.set('height', '10')
    const noFile = await SELF.fetch('https://album.test/api/photos', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(noFile.status).toBe(400)

    await expect(uploadPhoto(cookie, { albumId: 'album-de-outro-espaco' })).rejects.toThrow(/400/)

    const anon = await SELF.fetch('https://album.test/api/photos', { method: 'POST', body: form })
    expect(anon.status).toBe(401)
  })

  it('albumId de um álbum real de outro espaço → 400 (isolamento entre tenants)', async () => {
    const { cookie } = await setupSpace()
    const intruder = await createSecondSpace()
    const created = await postJson('/api/albums', { title: 'Álbum da intrusa' }, intruder.cookie)
    expect(created.status).toBe(201)
    const foreignAlbum = (await created.json()) as { id: string }

    await expect(uploadPhoto(cookie, { albumId: foreignAlbum.id })).rejects.toThrow(/400/)
  })
})
