import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../src/db'
import { spaces, users } from '../src/db/schema'

describe('schema e migrations', () => {
  it('cria as 7 tabelas e aceita insert/select via drizzle', async () => {
    const db = getDb(env.DB)
    await db.insert(spaces).values({ id: 's1', name: 'Nós', createdAt: new Date(1755400000000) })
    await db.insert(users).values({
      id: 'u1',
      name: 'Erick',
      email: 'e@x.co',
      passwordHash: 'hash',
      createdAt: new Date(1755400000000),
    })
    const all = await db.select().from(spaces)
    expect(all).toHaveLength(1)
    expect(all[0]?.name).toBe('Nós')

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%' AND name != 'd1_migrations'",
    ).all()
    const names = tables.results.map((r) => r.name).sort()
    expect(names).toEqual([
      'albums',
      'invites',
      'photos',
      'sessions',
      'space_members',
      'spaces',
      'users',
    ])
  })

  it('unique de email é aplicado', async () => {
    const db = getDb(env.DB)
    const row = {
      id: 'u3',
      name: 'A',
      email: 'dup@x.co',
      passwordHash: 'h',
      createdAt: new Date(),
    }
    await db.insert(users).values(row)
    await expect(db.insert(users).values({ ...row, id: 'u4' })).rejects.toThrow()
  })
})
