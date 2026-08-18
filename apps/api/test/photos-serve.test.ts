import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'

function get(path: string, cookie: string, headers: Record<string, string> = {}) {
  return SELF.fetch('https://album.test' + path, { headers: { cookie, ...headers } })
}

describe('GET /api/photos/:id/file|thumb', () => {
  it('devolve os bytes com content-type, cache privado e etag', async () => {
    const { cookie } = await setupSpace()
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42])
    const photo = await uploadPhoto(cookie, { fileBytes: bytes })

    const res = await get(`/api/photos/${photo.id}/file`, cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(res.headers.get('etag')).toBe(`"${photo.id}-file"`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)

    const thumb = await get(`/api/photos/${photo.id}/thumb`, cookie)
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('etag')).toBe(`"${photo.id}-thumb"`)
  })

  it('If-None-Match com o etag → 304', async () => {
    const { cookie } = await setupSpace()
    const photo = await uploadPhoto(cookie)
    const res = await get(`/api/photos/${photo.id}/file`, cookie, {
      'if-none-match': `"${photo.id}-file"`,
    })
    expect(res.status).toBe(304)
  })

  it('intruso → 404; sem sessão → 401; objeto ausente no R2 → 404', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie)

    const intruder = await createSecondSpace()
    expect((await get(`/api/photos/${photo.id}/file`, intruder.cookie)).status).toBe(404)

    const anon = await SELF.fetch(`https://album.test/api/photos/${photo.id}/file`)
    expect(anon.status).toBe(401)

    await env.PHOTOS.delete(photoKeys(spaceId, photo.id).file)
    expect((await get(`/api/photos/${photo.id}/file`, cookie)).status).toBe(404)
  })

  it('clamps hostile content-type to application/octet-stream', async () => {
    const { cookie, spaceId } = await setupSpace()
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42])
    const photo = await uploadPhoto(cookie, { fileBytes: bytes })

    const keys = photoKeys(spaceId, photo.id)
    await env.PHOTOS.put(keys.file, bytes, {
      httpMetadata: { contentType: 'text/html' },
    })

    const res = await get(`/api/photos/${photo.id}/file`, cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
