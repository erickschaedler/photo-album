import { z } from 'zod'

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  spaceName: z.string().trim().min(1).max(100),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
})

export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
})

export const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
})

export const updateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  coverPhotoId: z.string().nullable().optional(),
})

export const photoUploadFieldsSchema = z.object({
  takenAt: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  albumId: z.string().optional(),
})

export const listPhotosQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  albumId: z.string().optional(),
})

export const movePhotoSchema = z.object({
  albumId: z.string().nullable(),
})
