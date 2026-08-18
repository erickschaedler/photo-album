import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, postJson } from './client'
import { listPhotos } from './photos'

function mockFetch(response: Response) {
  const spy = vi.fn().mockImplementation(() => Promise.resolve(response.clone()))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('apiFetch', () => {
  it('devolve o JSON em resposta ok', async () => {
    mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(apiFetch<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
  })

  it('204 devolve undefined', async () => {
    mockFetch(new Response(null, { status: 204 }))
    await expect(apiFetch<void>('/api/x')).resolves.toBeUndefined()
  })

  it('erro da API vira ApiError com code e message do corpo', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Sessão ausente' } }), {
        status: 401,
      }),
    )
    const err = await apiFetch('/api/auth/me').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: 'Sessão ausente' })
  })

  it('corpo não-JSON vira ApiError genérico com o status', async () => {
    mockFetch(new Response('Bad Gateway', { status: 502 }))
    const err = await apiFetch('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 502, code: 'internal_error' })
  })

  it('falha de rede vira ApiError status 0 network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await apiFetch('/api/x').catch((e) => e)
    expect(err).toMatchObject({ status: 0, code: 'network_error' })
  })

  it('postJson envia método e content-type', async () => {
    const spy = mockFetch(new Response(JSON.stringify({}), { status: 200 }))
    await postJson('/api/auth/login', { email: 'a@b.co', password: 'x' })
    const [url, init] = spy.mock.calls[0]!
    expect(url).toBe('/api/auth/login')
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.co', password: 'x' })
  })
})

describe('listPhotos', () => {
  it('monta a query string só com os parâmetros presentes', async () => {
    const spy = mockFetch(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    )
    await listPhotos({ cursor: 'abc', albumId: 'al1' })
    expect(spy.mock.calls[0]![0]).toBe('/api/photos?cursor=abc&albumId=al1')
    await listPhotos()
    expect(spy.mock.calls[1]![0]).toBe('/api/photos')
  })
})
