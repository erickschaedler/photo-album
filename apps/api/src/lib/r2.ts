export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_THUMB_BYTES = 1024 * 1024
export const ALLOWED_MIMES = ['image/jpeg', 'image/webp', 'image/png']

export function photoKeys(spaceId: string, photoId: string) {
  return {
    file: `spaces/${spaceId}/photos/${photoId}/original`,
    thumb: `spaces/${spaceId}/photos/${photoId}/thumb`,
  }
}
