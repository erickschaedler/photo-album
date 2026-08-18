export interface ApiUser {
  id: string
  name: string
  email: string
}

export interface ApiSpace {
  id: string
  name: string
  role: 'owner' | 'member'
}

export interface ApiAlbum {
  id: string
  title: string
  description: string | null
  coverPhotoId: string | null
  photoCount: number
  createdAt: number
}

export interface ApiPhoto {
  id: string
  albumId: string | null
  uploadedBy: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: number
  createdAt: number
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
