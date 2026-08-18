import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_DIM, MAX_THUMB_DIM, extractTakenAt, scaleDimensions } from './process'

describe('scaleDimensions', () => {
  it('não mexe em imagem menor que o limite', () => {
    expect(scaleDimensions(800, 600, MAX_PHOTO_DIM)).toEqual({ width: 800, height: 600 })
  })

  it('reduz paisagem pelo lado maior mantendo proporção', () => {
    expect(scaleDimensions(5120, 2880, MAX_PHOTO_DIM)).toEqual({ width: 2560, height: 1440 })
  })

  it('reduz retrato pelo lado maior', () => {
    expect(scaleDimensions(3000, 4000, MAX_THUMB_DIM)).toEqual({ width: 300, height: 400 })
  })

  it('dimensão exatamente no limite não muda', () => {
    expect(scaleDimensions(2560, 1000, MAX_PHOTO_DIM)).toEqual({ width: 2560, height: 1000 })
  })

  it('arredonda para inteiro', () => {
    const { width, height } = scaleDimensions(3333, 2222, MAX_PHOTO_DIM)
    expect(Number.isInteger(width)).toBe(true)
    expect(Number.isInteger(height)).toBe(true)
    expect(width).toBe(2560)
  })
})

describe('extractTakenAt', () => {
  it('devolve undefined para arquivo sem EXIF', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'x.jpg', { type: 'image/jpeg' })
    await expect(extractTakenAt(file)).resolves.toBeUndefined()
  })
})
