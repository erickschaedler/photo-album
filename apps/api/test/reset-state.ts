import { env } from 'cloudflare:test'
import { beforeEach } from 'vitest'

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
