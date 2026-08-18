import { describe, expect, it } from 'vitest'
import { listPhotosQuerySchema, photoUploadFieldsSchema, setupSchema } from './schemas'

describe('setupSchema', () => {
  it('aceita payload válido e normaliza o e-mail', () => {
    const r = setupSchema.parse({
      name: 'Erick',
      email: 'Erick@Example.COM',
      password: 'segredo-forte',
      spaceName: 'Nós dois',
    })
    expect(r.email).toBe('erick@example.com')
  })

  it('rejeita senha curta', () => {
    expect(() =>
      setupSchema.parse({ name: 'E', email: 'a@b.co', password: '1234567', spaceName: 'x' }),
    ).toThrow()
  })
})

describe('photoUploadFieldsSchema', () => {
  it('coage números vindos de multipart (strings)', () => {
    const r = photoUploadFieldsSchema.parse({
      width: '2560',
      height: '1440',
      takenAt: '1755400000000',
    })
    expect(r).toMatchObject({ width: 2560, height: 1440, takenAt: 1755400000000 })
  })
})

describe('listPhotosQuerySchema', () => {
  it('aplica default de limit e o teto de 100', () => {
    expect(listPhotosQuerySchema.parse({}).limit).toBe(50)
    expect(() => listPhotosQuerySchema.parse({ limit: '101' })).toThrow()
  })
})
