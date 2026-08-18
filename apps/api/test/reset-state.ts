import { env } from 'cloudflare:test'
import { beforeEach } from 'vitest'

// @cloudflare/vitest-pool-workers does not isolate storage between tests within
// the same run: D1 rows and R2 objects persist across tests. Wipe both before
// every test so fixture files can use fixed ids without colliding.
const TABLES_IN_FK_SAFE_ORDER = [
  'photos',
  'albums',
  'invites',
  'sessions',
  'space_members',
  'spaces',
  'users',
] as const

async function resetD1() {
  await env.DB.batch(TABLES_IN_FK_SAFE_ORDER.map((table) => env.DB.prepare(`DELETE FROM ${table}`)))
}

async function resetR2() {
  let cursor: string | undefined
  do {
    const listed: Awaited<ReturnType<typeof env.PHOTOS.list>> = await env.PHOTOS.list(
      cursor ? { cursor } : undefined,
    )
    if (listed.objects.length > 0) {
      await env.PHOTOS.delete(listed.objects.map((object) => object.key))
    }
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
}

beforeEach(async () => {
  await resetD1()
  await resetR2()
})
