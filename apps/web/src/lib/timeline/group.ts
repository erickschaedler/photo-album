import type { ApiPhoto } from '@photo-album/shared'

export interface MonthGroup {
  key: string
  label: string
  photos: ApiPhoto[]
}

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

export function groupByMonth(photos: ApiPhoto[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const photo of photos) {
    const date = new Date(photo.takenAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.photos.push(photo)
    else groups.push({ key, label: monthFormat.format(date), photos: [photo] })
  }
  return groups
}
