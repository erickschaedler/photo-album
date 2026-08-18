import { Hono } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { createAlbumSchema, updateAlbumSchema } from '@photo-album/shared'
import type { ApiAlbum } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { albums, photos } from '../db/schema'
import { newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'

export const albumRoutes = new Hono<AppEnv>()

albumRoutes.use('*', requireAuth)

interface AlbumRow {
  id: string
  title: string
  description: string | null
  coverPhotoId: string | null
  createdAt: Date
}

function toApiAlbum(row: AlbumRow, photoCount: number): ApiAlbum {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverPhotoId: row.coverPhotoId,
    photoCount,
    createdAt: row.createdAt.getTime(),
  }
}

albumRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      description: albums.description,
      coverPhotoId: albums.coverPhotoId,
      createdAt: albums.createdAt,
      photoCount: count(photos.id),
    })
    .from(albums)
    .leftJoin(photos, eq(photos.albumId, albums.id))
    .where(eq(albums.spaceId, spaceId))
    .groupBy(albums.id)
    .orderBy(desc(albums.createdAt), desc(albums.id))
  return c.json({ items: rows.map((r) => toApiAlbum(r, r.photoCount as number)) })
})

albumRoutes.post(
  '/',
  zValidator('json', createAlbumSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const { title, description } = c.req.valid('json')
    const row = {
      id: newId(),
      spaceId: c.get('membership').spaceId,
      title,
      description: description ?? null,
      coverPhotoId: null,
      createdAt: new Date(),
    }
    await db.insert(albums).values(row)
    return c.json(toApiAlbum(row, 0), 201)
  },
)

async function findAlbum(db: ReturnType<typeof getDb>, spaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(albums)
    .where(and(eq(albums.id, id), eq(albums.spaceId, spaceId)))
    .limit(1)
  return row
}

albumRoutes.patch(
  '/:id',
  zValidator('json', updateAlbumSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const existing = await findAlbum(db, spaceId, c.req.param('id'))
    if (!existing) return apiError(c, 404, 'not_found', 'Álbum não encontrado')

    const patch = c.req.valid('json')
    if (patch.coverPhotoId != null) {
      const [photo] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.id, patch.coverPhotoId), eq(photos.spaceId, spaceId)))
        .limit(1)
      if (!photo) return apiError(c, 400, 'validation_error', 'Foto de capa inválida')
    }

    const updated = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.coverPhotoId !== undefined ? { coverPhotoId: patch.coverPhotoId } : {}),
    }
    await db
      .update(albums)
      .set({
        title: updated.title,
        description: updated.description,
        coverPhotoId: updated.coverPhotoId,
      })
      .where(and(eq(albums.id, existing.id), eq(albums.spaceId, spaceId)))

    const rows = await db
      .select({ photoCount: count(photos.id) })
      .from(photos)
      .where(eq(photos.albumId, existing.id))
    const photoCount = rows[0]?.photoCount ?? 0
    return c.json(toApiAlbum(updated, photoCount))
  },
)

albumRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const existing = await findAlbum(db, spaceId, c.req.param('id'))
  if (!existing) return apiError(c, 404, 'not_found', 'Álbum não encontrado')
  await db.delete(albums).where(and(eq(albums.id, existing.id), eq(albums.spaceId, spaceId)))
  return c.body(null, 204)
})
