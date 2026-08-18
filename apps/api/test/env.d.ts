import type { D1Migration } from '@cloudflare/vitest-pool-workers'

// This version of @cloudflare/vitest-pool-workers types `cloudflare:test`'s
// `env` export as `Cloudflare.Env` (the same global namespace `wrangler types`
// generates into `Env`), not a `ProvidedEnv` interface inside the
// `cloudflare:test` module augmentation. Augment that namespace instead.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      PHOTOS: R2Bucket
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

export {}
