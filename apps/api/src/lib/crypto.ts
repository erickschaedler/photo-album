const ITERATIONS = 100_000
const PREFIX = 'pbkdf2-sha256'

function toB64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, ITERATIONS)
  return `${PREFIX}$${ITERATIONS}$${toB64url(salt)}$${toB64url(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== PREFIX) return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1) return false
  try {
    const salt = fromB64url(parts[2]!)
    const expected = fromB64url(parts[3]!)
    const actual = await pbkdf2(password, salt, iterations)
    if (actual.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
    return diff === 0
  } catch {
    return false
  }
}

export function generateToken(): string {
  return toB64url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function newId(): string {
  return crypto.randomUUID()
}
