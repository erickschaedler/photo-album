import { describe, expect, it } from 'vitest'
import type { ApiPhoto } from '@photo-album/shared'
import { groupByMonth } from './group'

function photo(id: string, iso: string): ApiPhoto {
  return {
    id,
    albumId: null,
    uploadedBy: 'u1',
    mime: 'image/jpeg',
    width: 100,
    height: 100,
    sizeBytes: 1,
    takenAt: new Date(iso).getTime(),
    createdAt: 0,
  }
}

describe('groupByMonth', () => {
  it('lista vazia → sem grupos', () => {
    expect(groupByMonth([])).toEqual([])
  })

  it('agrupa fotos consecutivas do mesmo mês preservando a ordem', () => {
    const groups = groupByMonth([
      photo('a', '2026-08-15T12:00:00'),
      photo('b', '2026-08-01T09:00:00'),
      photo('c', '2026-07-30T18:00:00'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.photos.map((p) => p.id)).toEqual(['a', 'b'])
    expect(groups[1]!.photos.map((p) => p.id)).toEqual(['c'])
    expect(groups[0]!.key).toBe('2026-08')
    expect(groups[1]!.key).toBe('2026-07')
  })

  it('label vem em pt-BR com mês e ano', () => {
    const [group] = groupByMonth([photo('a', '2026-01-10T10:00:00')])
    expect(group!.label).toBe('janeiro de 2026')
  })

  it('vira o ano sem misturar dezembro e janeiro', () => {
    const groups = groupByMonth([
      photo('a', '2026-01-02T10:00:00'),
      photo('b', '2025-12-28T10:00:00'),
    ])
    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2025-12'])
  })
})
