import { Hono } from 'hono'
import type { Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import {
  listPhotosQuerySchema,
  movePhotoSchema,
  photoUploadFieldsSchema,
} from '@photo-album/shared'
import type { ApiPhoto } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { albums, photos } from '../db/schema'
import { newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { ALLOWED_MIMES, MAX_FILE_BYTES, MAX_THUMB_BYTES, photoKeys } from '../lib/r2'
import { requireAuth } from '../middleware/auth'
import { decodeCursor, encodeCursor } from '../lib/cursor'

export const photoRoutes = new Hono<AppEnv>()

photoRoutes.use('*', requireAuth)

export function toApiPhoto(row: {
  id: string
  albumId: string | null
  uploadedBy: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: Date
  createdAt: Date
}): ApiPhoto {
  return {
    id: row.id,
    albumId: row.albumId,
    uploadedBy: row.uploadedBy,
    mime: row.mime,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    takenAt: row.takenAt.getTime(),
    createdAt: row.createdAt.getTime(),
  }
}

photoRoutes.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  const thumb = body['thumb']
  if (!(file instanceof File) || !(thumb instanceof File))
    return apiError(c, 400, 'validation_error', 'Campos file e thumb são obrigatórios')

  const fields = photoUploadFieldsSchema.safeParse({
    takenAt: typeof body['takenAt'] === 'string' ? body['takenAt'] : undefined,
    width: body['width'],
    height: body['height'],
    albumId: typeof body['albumId'] === 'string' ? body['albumId'] : undefined,
  })
  if (!fields.success) return apiError(c, 400, 'validation_error', 'Campos inválidos')

  if (!ALLOWED_MIMES.includes(file.type) || !ALLOWED_MIMES.includes(thumb.type))
    return apiError(c, 400, 'unsupported_media', 'Formato de imagem não suportado')
  if (file.size > MAX_FILE_BYTES || thumb.size > MAX_THUMB_BYTES)
    return apiError(c, 413, 'too_large', 'Arquivo grande demais')

  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId

  if (fields.data.albumId) {
    const [album] = await db
      .select({ id: albums.id })
      .from(albums)
      .where(and(eq(albums.id, fields.data.albumId), eq(albums.spaceId, spaceId)))
      .limit(1)
    if (!album) return apiError(c, 400, 'validation_error', 'Álbum inválido')
  }

  const id = newId()
  const keys = photoKeys(spaceId, id)
  await c.env.PHOTOS.put(keys.file, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  await c.env.PHOTOS.put(keys.thumb, thumb.stream(), {
    httpMetadata: { contentType: thumb.type },
  })

  const row = {
    id,
    spaceId,
    albumId: fields.data.albumId ?? null,
    uploadedBy: c.get('user').id,
    r2Key: keys.file,
    thumbR2Key: keys.thumb,
    mime: file.type,
    width: fields.data.width,
    height: fields.data.height,
    sizeBytes: file.size,
    takenAt: new Date(fields.data.takenAt ?? Date.now()),
    createdAt: new Date(),
  }
  try {
    await db.insert(photos).values(row)
  } catch (err) {
    await c.env.PHOTOS.delete([keys.file, keys.thumb])
    throw err
  }
  return c.json(toApiPhoto(row), 201)
})

photoRoutes.get(
  '/',
  zValidator('query', listPhotosQuerySchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Query inválida')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const { cursor, limit, albumId } = c.req.valid('query')

    const conditions = [eq(photos.spaceId, spaceId)]
    if (albumId) conditions.push(eq(photos.albumId, albumId))
    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return apiError(c, 400, 'validation_error', 'Cursor inválido')
      const takenAt = new Date(decoded.takenAt)
      const condition = or(
        lt(photos.takenAt, takenAt),
        and(eq(photos.takenAt, takenAt), lt(photos.id, decoded.id)),
      )
      if (condition) conditions.push(condition)
    }

    const rows = await db
      .select()
      .from(photos)
      .where(and(...conditions))
      .orderBy(desc(photos.takenAt), desc(photos.id))
      .limit(limit + 1)

    const items = rows.slice(0, limit)
    const last = items[items.length - 1]
    const nextCursor =
      rows.length > limit && last ? encodeCursor(last.takenAt.getTime(), last.id) : null
    return c.json({ items: items.map(toApiPhoto), nextCursor })
  },
)

async function findPhoto(db: ReturnType<typeof getDb>, spaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.spaceId, spaceId)))
    .limit(1)
  return row
}

photoRoutes.patch(
  '/:id',
  zValidator('json', movePhotoSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const row = await findPhoto(db, spaceId, c.req.param('id'))
    if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')

    const { albumId } = c.req.valid('json')
    if (albumId) {
      const [album] = await db
        .select({ id: albums.id })
        .from(albums)
        .where(and(eq(albums.id, albumId), eq(albums.spaceId, spaceId)))
        .limit(1)
      if (!album) return apiError(c, 400, 'validation_error', 'Álbum inválido')
    }
    await db
      .update(photos)
      .set({ albumId })
      .where(and(eq(photos.id, row.id), eq(photos.spaceId, spaceId)))
    return c.json(toApiPhoto({ ...row, albumId }))
  },
)

photoRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const row = await findPhoto(db, spaceId, c.req.param('id'))
  if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')
  await db.delete(photos).where(and(eq(photos.id, row.id), eq(photos.spaceId, spaceId)))
  await c.env.PHOTOS.delete([row.r2Key, row.thumbR2Key])
  return c.body(null, 204)
})

async function servePhotoObject(c: Context<AppEnv>, kind: 'file' | 'thumb') {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const row = await findPhoto(db, spaceId, c.req.param('id') ?? '')
  if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')

  const etag = `"${row.id}-${kind}"`
  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304, {
      etag,
      'cache-control': 'private, max-age=31536000, immutable',
    })
  }

  const object = await c.env.PHOTOS.get(kind === 'file' ? row.r2Key : row.thumbR2Key)
  if (!object) return apiError(c, 404, 'not_found', 'Arquivo não encontrado')

  return c.body(object.body, 200, {
    'content-type': object.httpMetadata?.contentType ?? row.mime,
    'cache-control': 'private, max-age=31536000, immutable',
    etag,
  })
}

photoRoutes.get('/:id/file', (c) => servePhotoObject(c, 'file'))
photoRoutes.get('/:id/thumb', (c) => servePhotoObject(c, 'thumb'))
