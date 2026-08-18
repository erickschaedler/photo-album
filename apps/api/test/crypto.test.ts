import { describe, expect, it } from 'vitest'
import { generateToken, hashPassword, newId, sha256Hex, verifyPassword } from '../src/lib/crypto'

describe('hashPassword/verifyPassword', () => {
  it('verifica a senha correta e rejeita a errada', async () => {
    const stored = await hashPassword('minha-senha-secreta')
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/)
    expect(await verifyPassword('minha-senha-secreta', stored)).toBe(true)
    expect(await verifyPassword('outra-senha', stored)).toBe(false)
  })

  it('gera salts diferentes a cada hash', async () => {
    const a = await hashPassword('x')
    const b = await hashPassword('x')
    expect(a).not.toBe(b)
  })

  it('rejeita formato armazenado corrompido sem lançar', async () => {
    expect(await verifyPassword('x', 'lixo$invalido')).toBe(false)
  })
})

describe('tokens e ids', () => {
  it('generateToken devolve base64url com entropia de 32 bytes', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateToken()).not.toBe(t)
  })

  it('sha256Hex é determinístico', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('newId gera uuid', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
