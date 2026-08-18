import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { photoUploadFieldsSchema } from '@photo-album/shared'
import type { ApiPhoto } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { albums, photos } from '../db/schema'
import { newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { ALLOWED_MIMES, MAX_FILE_BYTES, MAX_THUMB_BYTES, photoKeys } from '../lib/r2'
import { requireAuth } from '../middleware/auth'

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
