import { SELF, env } from 'cloudflare:test'
import { getDb } from '../src/db'
import { spaceMembers, spaces, users } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { createSession } from '../src/lib/sessions'

const BASE = 'https://album.test'

export function getJson(path: string, cookie?: string) {
  return SELF.fetch(BASE + path, { headers: cookie ? { cookie } : {} })
}

export function postJson(path: string, body: unknown, cookie?: string) {
  return SELF.fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

export function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie')
  const m = setCookie?.match(/session=([^;]+)/)
  if (!m) throw new Error(`sem cookie de sessão em: ${setCookie}`)
  return `session=${m[1]}`
}

export async function setupSpace(
  overrides: Partial<{ name: string; email: string; password: string; spaceName: string }> = {},
) {
  const res = await postJson('/api/setup', {
    name: 'Erick',
    email: 'erick@x.co',
    password: 'senha-do-erick',
    spaceName: 'Nós dois',
    ...overrides,
  })
  if (res.status !== 201) throw new Error(`setup falhou: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string }; space: { id: string } }
  return { cookie: extractSessionCookie(res), userId: body.user.id, spaceId: body.space.id }
}

export interface UploadedPhoto {
  id: string
  albumId: string | null
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: number
  createdAt: number
}

export async function uploadPhoto(
  cookie: string,
  opts: Partial<{ takenAt: number; albumId: string; mime: string; fileBytes: Uint8Array }> = {},
): Promise<UploadedPhoto> {
  const mime = opts.mime ?? 'image/jpeg'
  // Re-wrap in a fresh Uint8Array<ArrayBuffer>: TS 5.7+ types Uint8Array as
  // generic over ArrayBufferLike, which File()'s BlobPart parameter rejects.
  const bytes = new Uint8Array(opts.fileBytes ?? [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  const form = new FormData()
  form.set('file', new File([bytes], 'foto.jpg', { type: mime }))
  form.set('thumb', new File([new Uint8Array([9, 9, 9])], 'thumb.jpg', { type: mime }))
  form.set('width', '2560')
  form.set('height', '1440')
  if (opts.takenAt !== undefined) form.set('takenAt', String(opts.takenAt))
  if (opts.albumId !== undefined) form.set('albumId', opts.albumId)
  const res = await SELF.fetch('https://album.test/api/photos', {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  if (res.status !== 201) throw new Error(`upload falhou: ${res.status} ${await res.text()}`)
  return (await res.json()) as UploadedPhoto
}

export async function createSecondSpace() {
  const db = getDb(env.DB)
  const now = new Date()
  const userId = newId()
  const spaceId = newId()
  await db.insert(users).values({
    id: userId,
    name: 'Intrusa',
    email: 'b@x.co',
    passwordHash: 'irrelevante',
    createdAt: now,
  })
  await db.insert(spaces).values({ id: spaceId, name: 'Outro espaço', createdAt: now })
  await db.insert(spaceMembers).values({ spaceId, userId, role: 'owner', joinedAt: now })
  const { token } = await createSession(db, userId)
  return { cookie: `session=${token}`, userId, spaceId }
}
