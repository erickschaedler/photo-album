import type { ApiAlbum } from '@photo-album/shared'
import { apiFetch, del, patchJson, postJson } from './client'

export async function listAlbums(): Promise<ApiAlbum[]> {
  return (await apiFetch<{ items: ApiAlbum[] }>('/api/albums')).items
}

export function createAlbum(data: { title: string; description?: string }): Promise<ApiAlbum> {
  return postJson<ApiAlbum>('/api/albums', data)
}

export function updateAlbum(
  id: string,
  patch: { title?: string; description?: string | null; coverPhotoId?: string | null },
): Promise<ApiAlbum> {
  return patchJson<ApiAlbum>(`/api/albums/${id}`, patch)
}

export function deleteAlbum(id: string): Promise<void> {
  return del(`/api/albums/${id}`)
}
