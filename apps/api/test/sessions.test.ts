import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../src/db'
import { sessions, spaceMembers, spaces, users } from '../src/db/schema'
import {
  SESSION_TTL_MS,
  createSession,
  deleteSessionByToken,
  validateSessionToken,
} from '../src/lib/sessions'
import { sha256Hex } from '../src/lib/crypto'
import { eq } from 'drizzle-orm'

async function seedUser(db: ReturnType<typeof getDb>) {
  const now = new Date()
  await db.insert(users).values({
    id: 'u1',
    name: 'Erick',
    email: 'e@x.co',
    passwordHash: 'h',
    createdAt: now,
  })
  await db.insert(spaces).values({ id: 's1', name: 'Nós', createdAt: now })
  await db
    .insert(spaceMembers)
    .values({ spaceId: 's1', userId: 'u1', role: 'owner', joinedAt: now })
}

describe('sessions', () => {
  it('cria e valida sessão, retornando user + membership', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token, expiresAt } = await createSession(db, 'u1')
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 5_000)

    const info = await validateSessionToken(db, token)
    expect(info?.user).toMatchObject({ id: 'u1', email: 'e@x.co' })
    expect(info?.membership).toEqual({ spaceId: 's1', role: 'owner' })
  })

  it('token desconhecido → null; sessão expirada → null e é apagada', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    expect(await validateSessionToken(db, 'token-inexistente')).toBeNull()

    const { token } = await createSession(db, 'u1')
    const tokenHash = await sha256Hex(token)
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, tokenHash))
    expect(await validateSessionToken(db, token)).toBeNull()
    const rows = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
    expect(rows).toHaveLength(0)
  })

  it('renova sessão perto de expirar (sliding) e expõe renewedExpiresAt', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token } = await createSession(db, 'u1')
    const tokenHash = await sha256Hex(token)
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 dia
    await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.tokenHash, tokenHash))

    const info = await validateSessionToken(db, token)
    expect(info?.renewedExpiresAt).toBeInstanceOf(Date)
    const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
    expect(row!.expiresAt.getTime()).toBe(info!.renewedExpiresAt!.getTime())
    expect(row!.expiresAt.getTime()).toBeGreaterThan(soon.getTime())
  })

  it('sessão longe de expirar não é renovada (sem renewedExpiresAt)', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token } = await createSession(db, 'u1')
    const info = await validateSessionToken(db, token)
    expect(info?.renewedExpiresAt).toBeUndefined()
  })

  it('deleteSessionByToken invalida', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token } = await createSession(db, 'u1')
    await deleteSessionByToken(db, token)
    expect(await validateSessionToken(db, token)).toBeNull()
  })
})
