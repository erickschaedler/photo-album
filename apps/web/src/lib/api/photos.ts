import type { ApiPhoto, Page } from '@photo-album/shared'
import { apiFetch, del, patchJson } from './client'

export interface PhotoUploadInput {
  file: Blob
  thumb: Blob
  width: number
  height: number
  takenAt?: number
  albumId?: string
}

export function listPhotos(
  params: { cursor?: string; limit?: number; albumId?: string } = {},
): Promise<Page<ApiPhoto>> {
  const q = new URLSearchParams()
  if (params.cursor) q.set('cursor', params.cursor)
  if (params.limit) q.set('limit', String(params.limit))
  if (params.albumId) q.set('albumId', params.albumId)
  const qs = q.toString()
  return apiFetch<Page<ApiPhoto>>(`/api/photos${qs ? `?${qs}` : ''}`)
}

export function uploadPhoto(input: PhotoUploadInput): Promise<ApiPhoto> {
  const form = new FormData()
  // A API exige instâncias de File nos campos file/thumb
  form.set('file', new File([input.file], 'foto.jpg', { type: input.file.type }))
  form.set('thumb', new File([input.thumb], 'thumb.jpg', { type: input.thumb.type }))
  form.set('width', String(input.width))
  form.set('height', String(input.height))
  if (input.takenAt !== undefined) form.set('takenAt', String(input.takenAt))
  if (input.albumId) form.set('albumId', input.albumId)
  return apiFetch<ApiPhoto>('/api/photos', { method: 'POST', body: form })
}

export function movePhoto(id: string, albumId: string | null): Promise<ApiPhoto> {
  return patchJson<ApiPhoto>(`/api/photos/${id}`, { albumId })
}

export function deletePhoto(id: string): Promise<void> {
  return del(`/api/photos/${id}`)
}

export function photoFileUrl(id: string): string {
  return `/api/photos/${id}/file`
}

export function photoThumbUrl(id: string): string {
  return `/api/photos/${id}/thumb`
}
