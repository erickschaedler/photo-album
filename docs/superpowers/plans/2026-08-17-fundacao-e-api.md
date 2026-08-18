# Photo Album — Plano 1: Fundação do monorepo + API Implementation Plan

> **STATUS: ✅ EXECUTADO E NO AR (18/08/2026).** Todos os 16 tasks concluídos via
> subagent-driven-development com review por task + review final de branch; produção em
> https://photo-album.photo-album-api.workers.dev com CI/Deploy verdes. Este documento é
> registro histórico — o estado vivo do projeto está em `CLAUDE.md` na raiz.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo pnpm com API Hono completa (auth, convites, álbuns, fotos com R2), testada de ponta a ponta no runtime real dos Workers, com shell mínimo do web e CI/deploy funcionando.

**Architecture:** Um único Cloudflare Worker responde `/api/*` com Hono e serve o build do SvelteKit como assets estáticos (`run_worker_first: ["/api/*"]`). Dados no D1 via Drizzle (migrations versionadas), fotos num bucket R2 privado. Testes de integração com `@cloudflare/vitest-pool-workers` (plugin `cloudflareTest`, Vitest 4) rodando contra D1/R2 locais reais.

**Tech Stack:** pnpm workspaces · TypeScript · Hono · Zod (`@hono/zod-validator`) · Drizzle ORM + drizzle-kit · Cloudflare Workers/D1/R2 · Vitest 4 + `@cloudflare/vitest-pool-workers` · SvelteKit (`adapter-static`, só o shell) · GitHub Actions + wrangler.

**Spec:** `docs/superpowers/specs/2026-08-17-photo-album-design.md`. Este plano cobre a fundação e a API; o Plano 2 (PWA web) vem depois.

## Global Constraints

- Node 22 LTS, pnpm 10 (`packageManager` no package.json raiz).
- TypeScript `strict: true` em todos os pacotes.
- Nomes dos bindings do Worker: `DB` (D1), `PHOTOS` (R2), `ASSETS` (assets estáticos). Worker chama-se `photo-album`.
- Toda query da API filtra por `space_id`. Recurso de outro espaço ou inexistente → **404 nos dois casos**.
- Erros da API sempre no formato `{ "error": { "code": string, "message": string } }`.
- Validação Zod inválida → 400 com `code: "validation_error"`; sem sessão → 401 `code: "unauthorized"`.
- Senhas: PBKDF2-SHA256, 100.000 iterações, via WebCrypto. Tokens (sessão/convite) guardados só como hash SHA-256; nunca em claro no banco.
- Cookie de sessão: `session`, HttpOnly, `Secure`, `SameSite=Lax`, `Path=/`, 30 dias.
- Timestamps em **inteiros (ms desde epoch)** no banco; ISO 8601 nas respostas JSON não — a API devolve números ms (o front formata).
- Commits: mensagens em inglês, prefixo convencional (`feat:`, `test:`, `chore:`, `docs:`, `ci:`), rodapé `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- A pasta raiz do repo local é `/Users/erickschaedler/Documents/Photo Album` (tem espaço no nome — sempre citar o path em comandos).

---

### Task 1: Scaffold do monorepo

**Files:**
- Modify: `.gitignore`
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (raiz)
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.prettierrc`
- Create: `eslint.config.js`
- Create: `README.md`

**Interfaces:**
- Consumes: nada (primeiro task).
- Produces: workspace pnpm onde `apps/*` e `packages/*` são pacotes; `tsconfig.base.json` que os demais estendem; scripts raiz `lint`, `format`, `typecheck`, `test`.

- [ ] **Step 1: Criar os arquivos de configuração**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`package.json`:

```json
{
  "name": "photo-album",
  "private": true,
  "packageManager": "pnpm@10.14.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "eslint": "^9.33.0",
    "typescript-eslint": "^8.39.0",
    "prettier": "^3.6.0",
    "typescript": "^5.9.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

`.nvmrc`:

```
22
```

`.prettierrc`:

```json
{ "semi": false, "singleQuote": true, "printWidth": 100 }
```

`eslint.config.js`:

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/', '**/build/', '**/.svelte-kit/', '**/drizzle/', '**/node_modules/'] },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),
)
```

`README.md` (stub — cresce nos tasks seguintes):

```markdown
# Photo Album

Álbum de fotos colaborativo para casais — PWA na Cloudflare (Workers + D1 + R2).

Monorepo pnpm: `apps/web` (SvelteKit), `apps/api` (Hono), `packages/shared` (Zod).

## Desenvolvimento

​```bash
pnpm install
pnpm test
​```

(Instruções completas de deploy chegam junto com o código.)
```

⚠️ Os fences internos acima começam com um caractere invisível (U+200B) só para caberem dentro deste bloco — no `README.md` real, escrever ```` ``` ```` puro, sem o caractere.

Acrescentar ao `.gitignore` existente:

```
node_modules/
dist/
build/
.svelte-kit/
.wrangler/
*.log
```

- [ ] **Step 2: Instalar e verificar**

Run: `cd "/Users/erickschaedler/Documents/Photo Album" && pnpm install && pnpm lint`
Expected: install ok; eslint/prettier passam (não há `.ts` ainda — sem erros).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: pnpm monorepo scaffold (workspace, tsconfig, eslint, prettier)"
```

---

### Task 2: `packages/shared` — schemas Zod e tipos da API

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` do Task 1.
- Produces: pacote `@photo-album/shared` exportando os schemas Zod (`setupSchema`, `loginSchema`, `acceptInviteSchema`, `createAlbumSchema`, `updateAlbumSchema`, `photoUploadFieldsSchema`, `listPhotosQuerySchema`, `movePhotoSchema`) e os tipos (`ApiUser`, `ApiAlbum`, `ApiPhoto`, `ApiSpace`, `Page<T>`, `ApiErrorBody`). A API (Tasks 7–13) importa tudo daqui.

- [ ] **Step 1: Criar o pacote**

`packages/shared/package.json`:

```json
{
  "name": "@photo-album/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.0.0" },
  "devDependencies": { "vitest": "^4.0.0" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 2: Escrever o teste que falha**

`packages/shared/src/schemas.test.ts`:

```ts
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
    const r = photoUploadFieldsSchema.parse({ width: '2560', height: '1440', takenAt: '1755400000000' })
    expect(r).toMatchObject({ width: 2560, height: 1440, takenAt: 1755400000000 })
  })
})

describe('listPhotosQuerySchema', () => {
  it('aplica default de limit e o teto de 100', () => {
    expect(listPhotosQuerySchema.parse({}).limit).toBe(50)
    expect(() => listPhotosQuerySchema.parse({ limit: '101' })).toThrow()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/shared test`
Expected: FAIL — `Cannot find module './schemas'` (após `pnpm install` para baixar zod/vitest).

- [ ] **Step 4: Implementar schemas e tipos**

`packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod'

export const setupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
  spaceName: z.string().trim().min(1).max(100),
})

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
})

export const acceptInviteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
})

export const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
})

export const updateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  coverPhotoId: z.string().nullable().optional(),
})

export const photoUploadFieldsSchema = z.object({
  takenAt: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  albumId: z.string().optional(),
})

export const listPhotosQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  albumId: z.string().optional(),
})

export const movePhotoSchema = z.object({
  albumId: z.string().nullable(),
})
```

`packages/shared/src/types.ts`:

```ts
export interface ApiUser {
  id: string
  name: string
  email: string
}

export interface ApiSpace {
  id: string
  name: string
  role: 'owner' | 'member'
}

export interface ApiAlbum {
  id: string
  title: string
  description: string | null
  coverPhotoId: string | null
  photoCount: number
  createdAt: number
}

export interface ApiPhoto {
  id: string
  albumId: string | null
  uploadedBy: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: number
  createdAt: number
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}
```

`packages/shared/src/index.ts`:

```ts
export * from './schemas'
export * from './types'
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm install && pnpm --filter @photo-album/shared test && pnpm --filter @photo-album/shared typecheck`
Expected: PASS (3 arquivos de describe, todos verdes) e typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add packages/ pnpm-lock.yaml && git commit -m "feat: shared zod schemas and api types"
```

---

### Task 3: `apps/api` — scaffold Hono + harness de testes no runtime dos Workers

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/wrangler.jsonc`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/lib/errors.ts`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/test/apply-migrations.ts`
- Create: `apps/api/test/env.d.ts`
- Create: `apps/api/drizzle/.gitkeep`
- Test: `apps/api/test/health.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (Task 1).
- Produces: app Hono exportado como default em `src/index.ts` com tipo `AppEnv = { Bindings: { DB: D1Database; PHOTOS: R2Bucket }; Variables: AppVariables }`; helper `apiError(c, status, code, message)`; harness de testes onde `SELF.fetch()` bate no Worker real com D1/R2 locais e migrations do diretório `drizzle/` aplicadas automaticamente. Todos os tasks de rota (7–13) usam este harness.

**Nota:** o bloco `assets` do wrangler.jsonc fica de fora AQUI de propósito — `wrangler dev` falharia com `../web/build` inexistente. Ele entra no Task 14, junto com o shell do web. Os testes não dependem do wrangler.jsonc (config do Miniflare é explícita no vitest.config.ts).

- [ ] **Step 1: Criar o pacote e as configs**

`apps/api/package.json`:

```json
{
  "name": "@photo-album/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@photo-album/shared": "workspace:*",
    "@hono/zod-validator": "^0.7.0",
    "drizzle-orm": "^0.44.0",
    "hono": "^4.9.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.9.0",
    "@cloudflare/workers-types": "^4.20260801.0",
    "drizzle-kit": "^0.31.0",
    "vitest": "^4.0.0",
    "wrangler": "^4.30.0"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"]
  },
  "include": ["src", "test", "vitest.config.ts", "drizzle.config.ts"]
}
```

`apps/api/wrangler.jsonc` (sem `assets` por ora; `database_id` é preenchido no Task 16):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "photo-album",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "photo-album",
      "database_id": "TODO-TASK-16",
      "migrations_dir": "drizzle"
    }
  ],
  "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "photo-album-photos" }],
  "observability": { "enabled": true }
}
```

- [ ] **Step 2: Configurar o harness de testes**

`apps/api/vitest.config.ts` — usa o plugin `cloudflareTest` (Vitest 4). A config do Miniflare é explícita (não lê o wrangler.jsonc) para os testes não dependerem de `database_id` real nem de assets:

```ts
import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'drizzle'))
      return {
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2026-08-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          r2Buckets: ['PHOTOS'],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
```

`apps/api/test/apply-migrations.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

`apps/api/test/env.d.ts`:

```ts
import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database
    PHOTOS: R2Bucket
    TEST_MIGRATIONS: D1Migration[]
  }
}
```

`apps/api/drizzle/.gitkeep`: arquivo vazio (o diretório precisa existir para `readD1Migrations`; a primeira migration chega no Task 4).

- [ ] **Step 3: Escrever o teste que falha**

`apps/api/test/health.test.ts`:

```ts
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const res = await SELF.fetch('https://album.test/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('rota /api desconhecida vira 404 padronizado', async () => {
    const res = await SELF.fetch('https://album.test/api/nao-existe')
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm install && pnpm --filter @photo-album/api test`
Expected: FAIL — `src/index.ts` não existe.

- [ ] **Step 5: Implementar o app mínimo**

`apps/api/src/lib/errors.ts`:

```ts
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function apiError(c: Context, status: ContentfulStatusCode, code: string, message: string) {
  return c.json({ error: { code, message } }, status)
}
```

`apps/api/src/index.ts`:

```ts
import { Hono } from 'hono'
import { apiError } from './lib/errors'

export interface AppVariables {
  user: { id: string; name: string; email: string }
  membership: { spaceId: string; role: 'owner' | 'member' }
  sessionToken: string
}

export type AppEnv = {
  Bindings: { DB: D1Database; PHOTOS: R2Bucket }
  Variables: AppVariables
}

const app = new Hono<AppEnv>()

app.get('/api/health', (c) => c.json({ ok: true }))

app.notFound((c) => apiError(c, 404, 'not_found', 'Recurso não encontrado'))

app.onError((err, c) => {
  console.error('unhandled error', err)
  return apiError(c, 500, 'internal_error', 'Erro interno')
})

export default app
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS (2 testes) e typecheck limpo. Se `readD1Migrations` reclamar do diretório vazio, confirmar que `drizzle/.gitkeep` existe (diretório presente, zero migrations é válido).

- [ ] **Step 7: Commit**

```bash
git add apps/api pnpm-lock.yaml && git commit -m "feat: api scaffold with hono and workers test harness"
```

---

### Task 4: Schema Drizzle + primeira migration

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/index.ts`
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/drizzle/0000_init.sql` (gerada por drizzle-kit, não escrita à mão)
- Test: `apps/api/test/db.test.ts`

**Interfaces:**
- Consumes: harness do Task 3.
- Produces: `getDb(d1: D1Database)` retornando Drizzle tipado; tabelas exportadas `users`, `sessions`, `spaces`, `spaceMembers`, `invites`, `albums`, `photos` (nomes de coluna camelCase no TS ↔ snake_case no SQL). Todos os tasks seguintes acessam o banco por aqui.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/db.test.ts`:

```ts
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
      id: 'u1',
      name: 'A',
      email: 'dup@x.co',
      passwordHash: 'h',
      createdAt: new Date(),
    }
    await db.insert(users).values(row)
    await expect(db.insert(users).values({ ...row, id: 'u2' })).rejects.toThrow()
  })
})
```

(`createdAt: new Date()` é permitido em teste — a restrição a `Date.now()` vale para scripts de Workflow, não para o código do projeto.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test`
Expected: FAIL — `../src/db` não existe.

- [ ] **Step 3: Implementar o schema**

`apps/api/src/db/schema.ts`:

```ts
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('sessions_token_hash_idx').on(t.tokenHash)],
)

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const spaceMembers = sqliteTable(
  'space_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
)

export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('invites_token_hash_idx').on(t.tokenHash)],
)

export const albums = sqliteTable(
  'albums',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    coverPhotoId: text('cover_photo_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('albums_space_idx').on(t.spaceId)],
)

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    albumId: text('album_id').references(() => albums.id, { onDelete: 'set null' }),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    r2Key: text('r2_key').notNull(),
    thumbR2Key: text('thumb_r2_key').notNull(),
    mime: text('mime').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    takenAt: integer('taken_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    index('photos_space_taken_idx').on(t.spaceId, t.takenAt, t.id),
    index('photos_album_idx').on(t.albumId),
  ],
)
```

Nota: `albums.coverPhotoId` não tem FK para `photos` de propósito (FK circular entre as duas tabelas complica migrations no SQLite); a integridade é garantida na rota (Task 10). `mime` é adição ao spec — necessário para o `Content-Type` ao servir o arquivo.

`apps/api/src/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof getDb>
```

`apps/api/drizzle.config.ts` (só para `generate` — aplicar é papel do wrangler):

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
```

- [ ] **Step 4: Gerar a migration**

Run: `pnpm --filter @photo-album/api db:generate -- --name=init`
Expected: cria `apps/api/drizzle/0000_init.sql` (7 `CREATE TABLE` + índices) e `apps/api/drizzle/meta/`. Conferir no SQL: `users`, `sessions`, `spaces`, `space_members`, `invites`, `albums`, `photos`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS — os dois testes novos + os do Task 3 (o setup aplica a migration antes de cada arquivo).

- [ ] **Step 6: Commit**

```bash
git add apps/api && git commit -m "feat: drizzle schema and initial d1 migration"
```

---

### Task 5: `lib/crypto.ts` — hash de senha e tokens

**Files:**
- Create: `apps/api/src/lib/crypto.ts`
- Test: `apps/api/test/crypto.test.ts`

**Interfaces:**
- Consumes: harness do Task 3.
- Produces:
  - `hashPassword(password: string): Promise<string>` → formato `pbkdf2-sha256$100000$<salt b64url>$<hash b64url>`
  - `verifyPassword(password: string, stored: string): Promise<boolean>` (comparação em tempo constante)
  - `generateToken(): string` — 32 bytes aleatórios em base64url (sem padding)
  - `sha256Hex(input: string): Promise<string>` — hex minúsculo
  - `newId(): string` — `crypto.randomUUID()`
  Tasks 6, 7, 9 usam tudo isso.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/crypto.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- crypto`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`apps/api/src/lib/crypto.ts`:

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/crypto.ts apps/api/test/crypto.test.ts && git commit -m "feat: password hashing (pbkdf2) and token helpers"
```

---

### Task 6: Sessões + middleware `requireAuth`

**Files:**
- Create: `apps/api/src/lib/sessions.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/index.ts` (registrar rota de teste não é necessário — o middleware é testado no Task 7 via rotas reais; aqui testamos as funções puras)
- Test: `apps/api/test/sessions.test.ts`

**Interfaces:**
- Consumes: `getDb` (Task 4); `generateToken`, `sha256Hex`, `newId` (Task 5).
- Produces:
  - `SESSION_COOKIE = 'session'`, `SESSION_TTL_MS = 30 dias`, `SESSION_RENEW_THRESHOLD_MS = 15 dias`
  - `createSession(db: Db, userId: string): Promise<{ token: string; expiresAt: Date }>`
  - `validateSessionToken(db: Db, token: string): Promise<SessionInfo | null>` onde `SessionInfo = { user: { id; name; email }; membership: { spaceId; role: 'owner' | 'member' } }` — renova `expiresAt` (sliding) quando faltam menos de 15 dias; retorna `null` para token inválido/expirado (sessão expirada é apagada)
  - `deleteSessionByToken(db: Db, token: string): Promise<void>`
  - `sessionCookieOptions(expiresAt: Date)` → objeto para o `setCookie` do Hono (`httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires`)
  - middleware `requireAuth` (Hono) que lê o cookie, valida e faz `c.set('user', ...)`, `c.set('membership', ...)`, `c.set('sessionToken', token)`; sem sessão válida → 401 `unauthorized`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/sessions.test.ts`:

```ts
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
  await db.insert(spaceMembers).values({ spaceId: 's1', userId: 'u1', role: 'owner', joinedAt: now })
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

  it('renova sessão perto de expirar (sliding)', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token } = await createSession(db, 'u1')
    const tokenHash = await sha256Hex(token)
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 dia
    await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.tokenHash, tokenHash))

    await validateSessionToken(db, token)
    const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash))
    expect(row!.expiresAt.getTime()).toBeGreaterThan(soon.getTime())
  })

  it('deleteSessionByToken invalida', async () => {
    const db = getDb(env.DB)
    await seedUser(db)
    const { token } = await createSession(db, 'u1')
    await deleteSessionByToken(db, token)
    expect(await validateSessionToken(db, token)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- sessions`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`apps/api/src/lib/sessions.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { sessions, spaceMembers, users } from '../db/schema'
import { generateToken, newId, sha256Hex } from './crypto'

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000

export interface SessionInfo {
  user: { id: string; name: string; email: string }
  membership: { spaceId: string; role: 'owner' | 'member' }
}

export async function createSession(db: Db, userId: string) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({
    id: newId(),
    tokenHash: await sha256Hex(token),
    userId,
    expiresAt,
    createdAt: new Date(),
  })
  return { token, expiresAt }
}

export async function validateSessionToken(db: Db, token: string): Promise<SessionInfo | null> {
  const tokenHash = await sha256Hex(token)
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      spaceId: spaceMembers.spaceId,
      role: spaceMembers.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(spaceMembers, eq(spaceMembers.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)

  if (!row) return null
  const now = Date.now()
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId))
    return null
  }
  if (row.expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.sessionId))
  }
  return {
    user: { id: row.userId, name: row.name, email: row.email },
    membership: { spaceId: row.spaceId, role: row.role },
  }
}

export async function deleteSessionByToken(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, await sha256Hex(token)))
}

export function sessionCookieOptions(expiresAt: Date) {
  return { httpOnly: true, secure: true, sameSite: 'Lax' as const, path: '/', expires: expiresAt }
}
```

`apps/api/src/middleware/auth.ts`:

```ts
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { apiError } from '../lib/errors'
import { SESSION_COOKIE, validateSessionToken } from '../lib/sessions'

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return apiError(c, 401, 'unauthorized', 'Sessão ausente')
  const info = await validateSessionToken(getDb(c.env.DB), token)
  if (!info) return apiError(c, 401, 'unauthorized', 'Sessão inválida ou expirada')
  c.set('user', info.user)
  c.set('membership', info.membership)
  c.set('sessionToken', token)
  await next()
})
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: d1-backed sessions with sliding renewal and auth middleware"
```

---

### Task 7: Rotas de setup (`GET/POST /api/setup`) + helpers de teste

**Files:**
- Create: `apps/api/src/routes/setup.ts`
- Modify: `apps/api/src/index.ts` (montar a rota)
- Create: `apps/api/test/helpers.ts`
- Test: `apps/api/test/setup.test.ts`

**Interfaces:**
- Consumes: `setupSchema` (Task 2); `getDb` (4); `hashPassword`, `newId` (5); `createSession`, `sessionCookieOptions`, `SESSION_COOKIE` (6); `apiError` (3).
- Produces:
  - `GET /api/setup` → 200 `{ needed: boolean }` (público)
  - `POST /api/setup` body `setupSchema` → 201 `{ user: ApiUser, space: ApiSpace }` + Set-Cookie de sessão; se já houver usuário → 409 `code: "already_set_up"`
  - Helpers de teste usados pelos Tasks 8–13:
    - `postJson(path: string, body: unknown, cookie?: string): Promise<Response>` — via `SELF.fetch`
    - `getJson(path: string, cookie?: string): Promise<Response>`
    - `extractSessionCookie(res: Response): string` — lê o `Set-Cookie` e devolve `session=<valor>`
    - `setupSpace(overrides?: Partial<{ name: string; email: string; password: string; spaceName: string }>): Promise<{ cookie: string; userId: string; spaceId: string }>`
    - `createSecondSpace(): Promise<{ cookie: string; userId: string; spaceId: string }>` — insere direto no D1 (via drizzle + createSession) um segundo espaço com usuário `b@x.co`, para os testes de isolamento

- [ ] **Step 1: Escrever helpers e o teste que falha**

`apps/api/test/helpers.ts`:

```ts
import { SELF, env } from 'cloudflare:test'
import { getDb } from '../src/db'
import { spaceMembers, spaces, users } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { createSession } from '../src/lib/sessions'

const BASE = 'https://album.test'

export function getJson(path: string, cookie?: string) {
  return SELF.fetch(BASE + path, { headers: cookie ? { cookie } : {} })
}

export function postJson(path: string, body: unknown, cookie?: string) {
  return SELF.fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

export function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie')
  const m = setCookie?.match(/session=([^;]+)/)
  if (!m) throw new Error(`sem cookie de sessão em: ${setCookie}`)
  return `session=${m[1]}`
}

export async function setupSpace(
  overrides: Partial<{ name: string; email: string; password: string; spaceName: string }> = {},
) {
  const res = await postJson('/api/setup', {
    name: 'Erick',
    email: 'erick@x.co',
    password: 'senha-do-erick',
    spaceName: 'Nós dois',
    ...overrides,
  })
  if (res.status !== 201) throw new Error(`setup falhou: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string }; space: { id: string } }
  return { cookie: extractSessionCookie(res), userId: body.user.id, spaceId: body.space.id }
}

export async function createSecondSpace() {
  const db = getDb(env.DB)
  const now = new Date()
  const userId = newId()
  const spaceId = newId()
  await db.insert(users).values({
    id: userId,
    name: 'Intrusa',
    email: 'b@x.co',
    passwordHash: 'irrelevante',
    createdAt: now,
  })
  await db.insert(spaces).values({ id: spaceId, name: 'Outro espaço', createdAt: now })
  await db.insert(spaceMembers).values({ spaceId, userId, role: 'owner', joinedAt: now })
  const { token } = await createSession(db, userId)
  return { cookie: `session=${token}`, userId, spaceId }
}
```

`apps/api/test/setup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

describe('setup', () => {
  it('GET /api/setup indica needed=true com banco vazio e false depois', async () => {
    const before = await getJson('/api/setup')
    expect(await before.json()).toEqual({ needed: true })
    await setupSpace()
    const after = await getJson('/api/setup')
    expect(await after.json()).toEqual({ needed: false })
  })

  it('POST cria user+space+sessão e o cookie autentica', async () => {
    const res = await postJson('/api/setup', {
      name: 'Erick',
      email: 'Erick@X.co',
      password: 'senha-do-erick',
      spaceName: 'Nós dois',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      user: { id: string; email: string }
      space: { id: string; name: string; role: string }
    }
    expect(body.user.email).toBe('erick@x.co')
    expect(body.space).toMatchObject({ name: 'Nós dois', role: 'owner' })
    expect(extractSessionCookie(res)).toMatch(/^session=/)
    // (o cookie autenticando de fato é coberto no Task 8, quando /api/auth/me existir)
  })

  it('segundo setup → 409', async () => {
    await setupSpace()
    const res = await postJson('/api/setup', {
      name: 'X',
      email: 'x@x.co',
      password: 'senha-qualquer',
      spaceName: 'Y',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('already_set_up')
  })

  it('payload inválido → 400 validation_error', async () => {
    const res = await postJson('/api/setup', { name: '', email: 'not-an-email', password: '1' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- setup`
Expected: FAIL — 404 nas rotas (não montadas).

- [ ] **Step 3: Implementar a rota**

`apps/api/src/routes/setup.ts`:

```ts
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import { setupSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { spaceMembers, spaces, users } from '../db/schema'
import { hashPassword, newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '../lib/sessions'

export const setupRoutes = new Hono<AppEnv>()

setupRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const anyUser = await db.select({ id: users.id }).from(users).limit(1)
  return c.json({ needed: anyUser.length === 0 })
})

setupRoutes.post(
  '/',
  zValidator('json', setupSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const anyUser = await db.select({ id: users.id }).from(users).limit(1)
    if (anyUser.length > 0) return apiError(c, 409, 'already_set_up', 'Setup já foi concluído')

    const { name, email, password, spaceName } = c.req.valid('json')
    const now = new Date()
    const userId = newId()
    const spaceId = newId()
    await db.insert(users).values({
      id: userId,
      name,
      email,
      passwordHash: await hashPassword(password),
      createdAt: now,
    })
    await db.insert(spaces).values({ id: spaceId, name: spaceName, createdAt: now })
    await db
      .insert(spaceMembers)
      .values({ spaceId, userId, role: 'owner', joinedAt: now })

    const { token, expiresAt } = await createSession(db, userId)
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return c.json(
      {
        user: { id: userId, name, email },
        space: { id: spaceId, name: spaceName, role: 'owner' as const },
      },
      201,
    )
  },
)
```

Em `apps/api/src/index.ts`, adicionar após `app.get('/api/health', ...)`:

```ts
import { setupRoutes } from './routes/setup'

app.route('/api/setup', setupRoutes)
```

(Import no topo do arquivo; `app.route` junto das demais montagens.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS — incluindo os testes anteriores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: first-run setup endpoint creating owner, space and session"
```

---

### Task 8: Rotas de auth (`/api/auth/login`, `/logout`, `/me`)

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts` (montar a rota)
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**
- Consumes: `loginSchema` (Task 2); `getDb` (4); `verifyPassword` (5); `createSession`, `deleteSessionByToken`, `sessionCookieOptions`, `SESSION_COOKIE` (6); `requireAuth` (6); helpers de teste (7).
- Produces:
  - `POST /api/auth/login` body `loginSchema` → 200 `{ user: ApiUser, space: ApiSpace }` + Set-Cookie; credencial errada → 401 `code: "invalid_credentials"` (mesma resposta para e-mail inexistente e senha errada)
  - `POST /api/auth/logout` (autenticada) → 204, apaga a sessão e limpa o cookie
  - `GET /api/auth/me` (autenticada) → 200 `{ user: ApiUser, space: ApiSpace }`

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

describe('auth', () => {
  it('login com credenciais corretas devolve user+space e cookie válido', async () => {
    await setupSpace()
    const res = await postJson('/api/auth/login', {
      email: 'Erick@X.co',
      password: 'senha-do-erick',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { email: string }; space: { role: string } }
    expect(body.user.email).toBe('erick@x.co')
    expect(body.space.role).toBe('owner')

    const cookie = extractSessionCookie(res)
    const me = await getJson('/api/auth/me', cookie)
    expect(me.status).toBe(200)
    const meBody = (await me.json()) as { user: { email: string } }
    expect(meBody.user.email).toBe('erick@x.co')
  })

  it('senha errada e e-mail inexistente → 401 invalid_credentials idênticos', async () => {
    await setupSpace()
    const wrongPass = await postJson('/api/auth/login', {
      email: 'erick@x.co',
      password: 'senha-errada',
    })
    const noUser = await postJson('/api/auth/login', {
      email: 'nao-existe@x.co',
      password: 'tanto-faz',
    })
    expect(wrongPass.status).toBe(401)
    expect(noUser.status).toBe(401)
    expect(await wrongPass.json()).toEqual(await noUser.json())
  })

  it('/api/auth/me sem cookie → 401 unauthorized', async () => {
    await setupSpace()
    const res = await getJson('/api/auth/me')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unauthorized')
  })

  it('logout invalida a sessão', async () => {
    const { cookie } = await setupSpace()
    const out = await postJson('/api/auth/logout', {}, cookie)
    expect(out.status).toBe(204)
    const me = await getJson('/api/auth/me', cookie)
    expect(me.status).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- auth`
Expected: FAIL — 404 nas rotas.

- [ ] **Step 3: Implementar**

`apps/api/src/routes/auth.ts`:

```ts
import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { loginSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { spaceMembers, spaces, users } from '../db/schema'
import { verifyPassword } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'
import {
  SESSION_COOKIE,
  createSession,
  deleteSessionByToken,
  sessionCookieOptions,
} from '../lib/sessions'

export const authRoutes = new Hono<AppEnv>()

authRoutes.post(
  '/login',
  zValidator('json', loginSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const { email, password } = c.req.valid('json')
    const [row] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        spaceId: spaceMembers.spaceId,
        role: spaceMembers.role,
        spaceName: spaces.name,
      })
      .from(users)
      .innerJoin(spaceMembers, eq(spaceMembers.userId, users.id))
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(eq(users.email, email))
      .limit(1)

    const ok = row && (await verifyPassword(password, row.passwordHash))
    if (!ok) return apiError(c, 401, 'invalid_credentials', 'E-mail ou senha incorretos')

    const { token, expiresAt } = await createSession(db, row.id)
    setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return c.json({
      user: { id: row.id, name: row.name, email: row.email },
      space: { id: row.spaceId, name: row.spaceName, role: row.role },
    })
  },
)

authRoutes.post('/logout', requireAuth, async (c) => {
  await deleteSessionByToken(getDb(c.env.DB), c.get('sessionToken'))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.body(null, 204)
})

authRoutes.get('/me', requireAuth, async (c) => {
  const db = getDb(c.env.DB)
  const membership = c.get('membership')
  const [space] = await db
    .select({ name: spaces.name })
    .from(spaces)
    .where(eq(spaces.id, membership.spaceId))
    .limit(1)
  return c.json({
    user: c.get('user'),
    space: { id: membership.spaceId, name: space?.name ?? '', role: membership.role },
  })
})
```

Em `apps/api/src/index.ts`:

```ts
import { authRoutes } from './routes/auth'

app.route('/api/auth', authRoutes)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: login, logout and me endpoints"
```

---

### Task 9: Convites (`/api/invites`)

**Files:**
- Create: `apps/api/src/routes/invites.ts`
- Modify: `apps/api/src/index.ts` (montar a rota)
- Test: `apps/api/test/invites.test.ts`

**Interfaces:**
- Consumes: `acceptInviteSchema` (Task 2); `getDb` (4); `generateToken`, `sha256Hex`, `hashPassword`, `newId` (5); sessões/`requireAuth` (6); helpers (7).
- Produces:
  - `POST /api/invites` (autenticada, **owner only** → member recebe 403 `code: "forbidden"`) → 201 `{ token: string, url: string, expiresAt: number }` com `url = "/invite/" + token` e validade de 7 dias (`INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000` exportado)
  - `GET /api/invites/:token` (pública) → 200 `{ spaceName: string, inviterName: string }`; inválido/expirado/usado → 404 `not_found`
  - `POST /api/invites/:token/accept` (pública) body `acceptInviteSchema` → 201 `{ user: ApiUser, space: ApiSpace }` + Set-Cookie (role `member`), marca `usedAt`; convite inválido/expirado/usado → 404; e-mail já cadastrado → 409 `code: "email_in_use"`

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/invites.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { getDb } from '../src/db'
import { invites } from '../src/db/schema'
import { extractSessionCookie, getJson, postJson, setupSpace } from './helpers'

async function createInvite(cookie: string) {
  const res = await postJson('/api/invites', {}, cookie)
  expect(res.status).toBe(201)
  return (await res.json()) as { token: string; url: string; expiresAt: number }
}

describe('invites', () => {
  it('owner cria convite; GET público mostra espaço e quem convidou', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    expect(inv.url).toBe(`/invite/${inv.token}`)
    expect(inv.expiresAt).toBeGreaterThan(Date.now())

    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(200)
    expect(await info.json()).toEqual({ spaceName: 'Nós dois', inviterName: 'Erick' })
  })

  it('accept cria a segunda conta como member no mesmo espaço e loga', async () => {
    const { cookie, spaceId } = await setupSpace()
    const inv = await createInvite(cookie)
    const res = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'Namorada',
      email: 'ela@x.co',
      password: 'senha-dela-123',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { user: { email: string }; space: { id: string; role: string } }
    expect(body.user.email).toBe('ela@x.co')
    expect(body.space).toMatchObject({ id: spaceId, role: 'member' })

    const her = extractSessionCookie(res)
    const me = await getJson('/api/auth/me', her)
    expect(me.status).toBe(200)
  })

  it('convite é de uso único', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'A',
      email: 'a1@x.co',
      password: 'senha-123-abc',
    })
    const again = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'B',
      email: 'a2@x.co',
      password: 'senha-123-abc',
    })
    expect(again.status).toBe(404)
    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(404)
  })

  it('convite expirado → 404', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const db = getDb(env.DB)
    // expira todos os convites (só existe um neste teste)
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) })
    const info = await getJson(`/api/invites/${inv.token}`)
    expect(info.status).toBe(404)
  })

  it('member não cria convite (403); sem login, 401; token aleatório, 404', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const accept = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'N',
      email: 'ela@x.co',
      password: 'senha-dela-123',
    })
    const her = extractSessionCookie(accept)

    const asMember = await postJson('/api/invites', {}, her)
    expect(asMember.status).toBe(403)
    const noAuth = await postJson('/api/invites', {})
    expect(noAuth.status).toBe(401)
    const bogus = await getJson('/api/invites/token-que-nao-existe')
    expect(bogus.status).toBe(404)
  })

  it('e-mail já cadastrado no accept → 409 email_in_use', async () => {
    const { cookie } = await setupSpace()
    const inv = await createInvite(cookie)
    const res = await postJson(`/api/invites/${inv.token}/accept`, {
      name: 'Duplicada',
      email: 'erick@x.co',
      password: 'senha-123-abc',
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('email_in_use')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- invites`
Expected: FAIL — 404/rotas ausentes.

- [ ] **Step 3: Implementar**

`apps/api/src/routes/invites.ts`:

```ts
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { acceptInviteSchema } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { invites, spaceMembers, spaces, users } from '../db/schema'
import { generateToken, hashPassword, newId, sha256Hex } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'
import { SESSION_COOKIE, createSession, sessionCookieOptions } from '../lib/sessions'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const inviteRoutes = new Hono<AppEnv>()

inviteRoutes.post('/', requireAuth, async (c) => {
  const membership = c.get('membership')
  if (membership.role !== 'owner')
    return apiError(c, 403, 'forbidden', 'Só o dono do espaço convida')

  const db = getDb(c.env.DB)
  const token = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.insert(invites).values({
    id: newId(),
    tokenHash: await sha256Hex(token),
    spaceId: membership.spaceId,
    createdBy: c.get('user').id,
    expiresAt,
  })
  return c.json({ token, url: `/invite/${token}`, expiresAt: expiresAt.getTime() }, 201)
})

async function findValidInvite(db: ReturnType<typeof getDb>, token: string) {
  const tokenHash = await sha256Hex(token)
  const [row] = await db
    .select({
      id: invites.id,
      spaceId: invites.spaceId,
      spaceName: spaces.name,
      inviterName: users.name,
    })
    .from(invites)
    .innerJoin(spaces, eq(spaces.id, invites.spaceId))
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(
      and(
        eq(invites.tokenHash, tokenHash),
        isNull(invites.usedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return row
}

inviteRoutes.get('/:token', async (c) => {
  const row = await findValidInvite(getDb(c.env.DB), c.req.param('token'))
  if (!row) return apiError(c, 404, 'not_found', 'Convite inválido ou expirado')
  return c.json({ spaceName: row.spaceName, inviterName: row.inviterName })
})

inviteRoutes.post(
  '/:token/accept',
  zValidator('json', acceptInviteSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const row = await findValidInvite(db, c.req.param('token'))
    if (!row) return apiError(c, 404, 'not_found', 'Convite inválido ou expirado')

    const { name, email, password } = c.req.valid('json')
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing.length > 0) return apiError(c, 409, 'email_in_use', 'E-mail já cadastrado')

    const now = new Date()
    const userId = newId()
    await db.insert(users).values({
      id: userId,
      name,
      email,
      passwordHash: await hashPassword(password),
      createdAt: now,
    })
    await db
      .insert(spaceMembers)
      .values({ spaceId: row.spaceId, userId, role: 'member', joinedAt: now })
    await db.update(invites).set({ usedAt: now }).where(eq(invites.id, row.id))

    const { token: session, expiresAt } = await createSession(db, userId)
    setCookie(c, SESSION_COOKIE, session, sessionCookieOptions(expiresAt))
    return c.json(
      {
        user: { id: userId, name, email },
        space: { id: row.spaceId, name: row.spaceName, role: 'member' as const },
      },
      201,
    )
  },
)
```

Em `apps/api/src/index.ts`:

```ts
import { inviteRoutes } from './routes/invites'

app.route('/api/invites', inviteRoutes)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: single-use invite flow with hashed tokens"
```

---

### Task 10: Álbuns (`/api/albums`)

**Files:**
- Create: `apps/api/src/routes/albums.ts`
- Modify: `apps/api/src/index.ts` (montar a rota)
- Test: `apps/api/test/albums.test.ts`

**Interfaces:**
- Consumes: `createAlbumSchema`, `updateAlbumSchema` (Task 2); `getDb` (4); `newId` (5); `requireAuth` (6); helpers (7).
- Produces (todas autenticadas):
  - `GET /api/albums` → 200 `{ items: ApiAlbum[] }` ordenado por `createdAt` desc, com `photoCount` (LEFT JOIN + count)
  - `POST /api/albums` body `createAlbumSchema` → 201 `ApiAlbum` (photoCount 0)
  - `PATCH /api/albums/:id` body `updateAlbumSchema` → 200 `ApiAlbum`; `coverPhotoId` só aceita foto do mesmo espaço (senão 400 `validation_error`); álbum de outro espaço/inexistente → 404
  - `DELETE /api/albums/:id` → 204; fotos do álbum ficam com `albumId = null` (o `ON DELETE SET NULL` do schema resolve); outro espaço → 404
  - Helper interno `toApiAlbum(row): ApiAlbum` reutilizado nas quatro rotas.

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/albums.test.ts`:

```ts
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, getJson, postJson, setupSpace } from './helpers'

function patchJson(path: string, body: unknown, cookie: string) {
  return SELF.fetch('https://album.test' + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function del(path: string, cookie: string) {
  return SELF.fetch('https://album.test' + path, { method: 'DELETE', headers: { cookie } })
}

describe('albums', () => {
  it('cria, lista e edita álbum', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Viagem à praia' }, cookie)
    expect(created.status).toBe(201)
    const album = (await created.json()) as { id: string; title: string; photoCount: number }
    expect(album).toMatchObject({ title: 'Viagem à praia', photoCount: 0 })

    const list = await getJson('/api/albums', cookie)
    const body = (await list.json()) as { items: { id: string }[] }
    expect(body.items.map((a) => a.id)).toEqual([album.id])

    const patched = await patchJson(`/api/albums/${album.id}`, { title: 'Praia 2026' }, cookie)
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { title: string }).title).toBe('Praia 2026')
  })

  it('DELETE remove o álbum', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Temporário' }, cookie)
    const album = (await created.json()) as { id: string }
    expect((await del(`/api/albums/${album.id}`, cookie)).status).toBe(204)
    const list = await getJson('/api/albums', cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
  })

  it('isolamento: espaço B não vê nem altera álbum do espaço A', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Nosso' }, cookie)
    const album = (await created.json()) as { id: string }

    const intruder = await createSecondSpace()
    const list = await getJson('/api/albums', intruder.cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
    expect((await patchJson(`/api/albums/${album.id}`, { title: 'hack' }, intruder.cookie)).status).toBe(404)
    expect((await del(`/api/albums/${album.id}`, intruder.cookie)).status).toBe(404)
  })

  it('coverPhotoId de outro espaço → 400', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Capa' }, cookie)
    const album = (await created.json()) as { id: string }
    const res = await patchJson(`/api/albums/${album.id}`, { coverPhotoId: 'foto-inexistente' }, cookie)
    expect(res.status).toBe(400)
  })

  it('sem sessão → 401', async () => {
    expect((await getJson('/api/albums')).status).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- albums`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`apps/api/src/routes/albums.ts`:

```ts
import { Hono } from 'hono'
import { and, count, desc, eq } from 'drizzle-orm'
import { zValidator } from '@hono/zod-validator'
import { createAlbumSchema, updateAlbumSchema } from '@photo-album/shared'
import type { ApiAlbum } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { albums, photos } from '../db/schema'
import { newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { requireAuth } from '../middleware/auth'

export const albumRoutes = new Hono<AppEnv>()

albumRoutes.use('*', requireAuth)

interface AlbumRow {
  id: string
  title: string
  description: string | null
  coverPhotoId: string | null
  createdAt: Date
}

function toApiAlbum(row: AlbumRow, photoCount: number): ApiAlbum {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverPhotoId: row.coverPhotoId,
    photoCount,
    createdAt: row.createdAt.getTime(),
  }
}

albumRoutes.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      description: albums.description,
      coverPhotoId: albums.coverPhotoId,
      createdAt: albums.createdAt,
      photoCount: count(photos.id),
    })
    .from(albums)
    .leftJoin(photos, eq(photos.albumId, albums.id))
    .where(eq(albums.spaceId, spaceId))
    .groupBy(albums.id)
    .orderBy(desc(albums.createdAt), desc(albums.id))
  return c.json({ items: rows.map((r) => toApiAlbum(r, r.photoCount)) })
})

albumRoutes.post(
  '/',
  zValidator('json', createAlbumSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const { title, description } = c.req.valid('json')
    const row = {
      id: newId(),
      spaceId: c.get('membership').spaceId,
      title,
      description: description ?? null,
      coverPhotoId: null,
      createdAt: new Date(),
    }
    await db.insert(albums).values(row)
    return c.json(toApiAlbum(row, 0), 201)
  },
)

async function findAlbum(db: ReturnType<typeof getDb>, spaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(albums)
    .where(and(eq(albums.id, id), eq(albums.spaceId, spaceId)))
    .limit(1)
  return row
}

albumRoutes.patch(
  '/:id',
  zValidator('json', updateAlbumSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const existing = await findAlbum(db, spaceId, c.req.param('id'))
    if (!existing) return apiError(c, 404, 'not_found', 'Álbum não encontrado')

    const patch = c.req.valid('json')
    if (patch.coverPhotoId) {
      const [photo] = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.id, patch.coverPhotoId), eq(photos.spaceId, spaceId)))
        .limit(1)
      if (!photo) return apiError(c, 400, 'validation_error', 'Foto de capa inválida')
    }

    const updated = {
      ...existing,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.coverPhotoId !== undefined ? { coverPhotoId: patch.coverPhotoId } : {}),
    }
    await db
      .update(albums)
      .set({
        title: updated.title,
        description: updated.description,
        coverPhotoId: updated.coverPhotoId,
      })
      .where(and(eq(albums.id, existing.id), eq(albums.spaceId, spaceId)))

    const [{ photoCount }] = (await db
      .select({ photoCount: count(photos.id) })
      .from(photos)
      .where(eq(photos.albumId, existing.id))) as [{ photoCount: number }]
    return c.json(toApiAlbum(updated, photoCount))
  },
)

albumRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const existing = await findAlbum(db, spaceId, c.req.param('id'))
  if (!existing) return apiError(c, 404, 'not_found', 'Álbum não encontrado')
  await db.delete(albums).where(and(eq(albums.id, existing.id), eq(albums.spaceId, spaceId)))
  return c.body(null, 204)
})
```

Em `apps/api/src/index.ts`:

```ts
import { albumRoutes } from './routes/albums'

app.route('/api/albums', albumRoutes)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: album crud with space isolation and photo counts"
```

---

### Task 11: Upload de fotos (`POST /api/photos`)

**Files:**
- Create: `apps/api/src/routes/photos.ts` (só o POST neste task)
- Create: `apps/api/src/lib/r2.ts`
- Modify: `apps/api/src/index.ts` (montar a rota)
- Modify: `apps/api/test/helpers.ts` (adicionar `uploadPhoto`)
- Test: `apps/api/test/photos-upload.test.ts`

**Interfaces:**
- Consumes: `photoUploadFieldsSchema` (Task 2); `getDb` (4); `newId` (5); `requireAuth` (6); helpers (7).
- Produces:
  - `photoKeys(spaceId: string, photoId: string)` → `{ file: "spaces/<spaceId>/photos/<photoId>/original", thumb: "spaces/<spaceId>/photos/<photoId>/thumb" }` (em `lib/r2.ts`)
  - `MAX_FILE_BYTES = 15 * 1024 * 1024`, `MAX_THUMB_BYTES = 1024 * 1024`, `ALLOWED_MIMES = ['image/jpeg', 'image/webp', 'image/png']` (em `lib/r2.ts`)
  - `POST /api/photos` (autenticada) — multipart com campos `file` (File), `thumb` (File) e os campos de `photoUploadFieldsSchema` → 201 `ApiPhoto`. Erros: sem `file`/`thumb` ou campos inválidos → 400 `validation_error`; mime fora da lista → 400 `unsupported_media`; arquivo grande demais → 413 `too_large`; `albumId` de outro espaço → 400 `validation_error`. `takenAt` ausente → usa o horário do upload. Grava `file` e `thumb` no R2 (com `httpMetadata.contentType`) **antes** de inserir a linha no D1 (se o insert falhar, apaga os objetos).
  - Helper de teste `uploadPhoto(cookie: string, opts?: Partial<{ takenAt: number; albumId: string; mime: string; fileBytes: Uint8Array }>): Promise<UploadedPhoto>` em `helpers.ts` (com `interface UploadedPhoto` local espelhando `ApiPhoto` sem `uploadedBy`) — usado também nos Tasks 12/13.

- [ ] **Step 1: Adicionar helper e escrever o teste que falha**

Adicionar em `apps/api/test/helpers.ts`:

```ts
export interface UploadedPhoto {
  id: string
  albumId: string | null
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: number
  createdAt: number
}

export async function uploadPhoto(
  cookie: string,
  opts: Partial<{ takenAt: number; albumId: string; mime: string; fileBytes: Uint8Array }> = {},
): Promise<UploadedPhoto> {
  const mime = opts.mime ?? 'image/jpeg'
  const bytes = opts.fileBytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  const form = new FormData()
  form.set('file', new File([bytes], 'foto.jpg', { type: mime }))
  form.set('thumb', new File([new Uint8Array([9, 9, 9])], 'thumb.jpg', { type: mime }))
  form.set('width', '2560')
  form.set('height', '1440')
  if (opts.takenAt !== undefined) form.set('takenAt', String(opts.takenAt))
  if (opts.albumId !== undefined) form.set('albumId', opts.albumId)
  const res = await SELF.fetch('https://album.test/api/photos', {
    method: 'POST',
    headers: { cookie },
    body: form,
  })
  if (res.status !== 201) throw new Error(`upload falhou: ${res.status} ${await res.text()}`)
  return (await res.json()) as UploadedPhoto
}
```

`apps/api/test/photos-upload.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { postJson, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'

describe('POST /api/photos', () => {
  it('grava arquivo+thumb no R2 e metadados no D1', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie, { takenAt: 1700000000000 })
    expect(photo).toMatchObject({
      albumId: null,
      mime: 'image/jpeg',
      width: 2560,
      height: 1440,
      takenAt: 1700000000000,
    })
    expect(photo.sizeBytes).toBe(7)

    const keys = photoKeys(spaceId, photo.id)
    const original = await env.PHOTOS.get(keys.file)
    const thumb = await env.PHOTOS.get(keys.thumb)
    expect(original).not.toBeNull()
    expect(thumb).not.toBeNull()
    expect(original!.httpMetadata?.contentType).toBe('image/jpeg')
  })

  it('sem takenAt usa horário do upload; albumId válido associa', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'Álbum' }, cookie)
    const album = (await created.json()) as { id: string }
    const before = Date.now()
    const photo = await uploadPhoto(cookie, { albumId: album.id })
    expect(photo.takenAt).toBeGreaterThanOrEqual(before)
    expect(photo.albumId).toBe(album.id)
  })

  it('mime não permitido → 400 unsupported_media', async () => {
    const { cookie } = await setupSpace()
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1])], 'x.gif', { type: 'image/gif' }))
    form.set('thumb', new File([new Uint8Array([1])], 't.gif', { type: 'image/gif' }))
    form.set('width', '10')
    form.set('height', '10')
    const res = await SELF.fetch('https://album.test/api/photos', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unsupported_media')
  })

  it('multipart sem file → 400; albumId de outro espaço → 400; sem sessão → 401', async () => {
    const { cookie } = await setupSpace()
    const form = new FormData()
    form.set('width', '10')
    form.set('height', '10')
    const noFile = await SELF.fetch('https://album.test/api/photos', {
      method: 'POST',
      headers: { cookie },
      body: form,
    })
    expect(noFile.status).toBe(400)

    await expect(uploadPhoto(cookie, { albumId: 'album-de-outro-espaco' })).rejects.toThrow(/400/)

    const anon = await SELF.fetch('https://album.test/api/photos', { method: 'POST', body: form })
    expect(anon.status).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- photos-upload`
Expected: FAIL — rota/`lib/r2` inexistentes.

- [ ] **Step 3: Implementar**

`apps/api/src/lib/r2.ts`:

```ts
export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_THUMB_BYTES = 1024 * 1024
export const ALLOWED_MIMES = ['image/jpeg', 'image/webp', 'image/png']

export function photoKeys(spaceId: string, photoId: string) {
  return {
    file: `spaces/${spaceId}/photos/${photoId}/original`,
    thumb: `spaces/${spaceId}/photos/${photoId}/thumb`,
  }
}
```

`apps/api/src/routes/photos.ts`:

```ts
import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { photoUploadFieldsSchema } from '@photo-album/shared'
import type { ApiPhoto } from '@photo-album/shared'
import type { AppEnv } from '../index'
import { getDb } from '../db'
import { albums, photos } from '../db/schema'
import { newId } from '../lib/crypto'
import { apiError } from '../lib/errors'
import { ALLOWED_MIMES, MAX_FILE_BYTES, MAX_THUMB_BYTES, photoKeys } from '../lib/r2'
import { requireAuth } from '../middleware/auth'

export const photoRoutes = new Hono<AppEnv>()

photoRoutes.use('*', requireAuth)

export function toApiPhoto(row: {
  id: string
  albumId: string | null
  uploadedBy: string
  mime: string
  width: number
  height: number
  sizeBytes: number
  takenAt: Date
  createdAt: Date
}): ApiPhoto {
  return {
    id: row.id,
    albumId: row.albumId,
    uploadedBy: row.uploadedBy,
    mime: row.mime,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    takenAt: row.takenAt.getTime(),
    createdAt: row.createdAt.getTime(),
  }
}

photoRoutes.post('/', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']
  const thumb = body['thumb']
  if (!(file instanceof File) || !(thumb instanceof File))
    return apiError(c, 400, 'validation_error', 'Campos file e thumb são obrigatórios')

  const fields = photoUploadFieldsSchema.safeParse({
    takenAt: typeof body['takenAt'] === 'string' ? body['takenAt'] : undefined,
    width: body['width'],
    height: body['height'],
    albumId: typeof body['albumId'] === 'string' ? body['albumId'] : undefined,
  })
  if (!fields.success) return apiError(c, 400, 'validation_error', 'Campos inválidos')

  if (!ALLOWED_MIMES.includes(file.type) || !ALLOWED_MIMES.includes(thumb.type))
    return apiError(c, 400, 'unsupported_media', 'Formato de imagem não suportado')
  if (file.size > MAX_FILE_BYTES || thumb.size > MAX_THUMB_BYTES)
    return apiError(c, 413, 'too_large', 'Arquivo grande demais')

  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId

  if (fields.data.albumId) {
    const [album] = await db
      .select({ id: albums.id })
      .from(albums)
      .where(and(eq(albums.id, fields.data.albumId), eq(albums.spaceId, spaceId)))
      .limit(1)
    if (!album) return apiError(c, 400, 'validation_error', 'Álbum inválido')
  }

  const id = newId()
  const keys = photoKeys(spaceId, id)
  await c.env.PHOTOS.put(keys.file, file.stream(), {
    httpMetadata: { contentType: file.type },
  })
  await c.env.PHOTOS.put(keys.thumb, thumb.stream(), {
    httpMetadata: { contentType: thumb.type },
  })

  const row = {
    id,
    spaceId,
    albumId: fields.data.albumId ?? null,
    uploadedBy: c.get('user').id,
    r2Key: keys.file,
    thumbR2Key: keys.thumb,
    mime: file.type,
    width: fields.data.width,
    height: fields.data.height,
    sizeBytes: file.size,
    takenAt: new Date(fields.data.takenAt ?? Date.now()),
    createdAt: new Date(),
  }
  try {
    await db.insert(photos).values(row)
  } catch (err) {
    await c.env.PHOTOS.delete([keys.file, keys.thumb])
    throw err
  }
  return c.json(toApiPhoto(row), 201)
})
```

Em `apps/api/src/index.ts`:

```ts
import { photoRoutes } from './routes/photos'

app.route('/api/photos', photoRoutes)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: photo upload storing processed file and thumb in r2"
```

---

### Task 12: Listagem paginada, mover para álbum e excluir foto

**Files:**
- Modify: `apps/api/src/routes/photos.ts`
- Create: `apps/api/src/lib/cursor.ts`
- Test: `apps/api/test/photos-list.test.ts`

**Interfaces:**
- Consumes: `listPhotosQuerySchema`, `movePhotoSchema` (Task 2); `uploadPhoto`, `createSecondSpace` e demais helpers (7/11); `photoKeys` (11).
- Produces:
  - `encodeCursor(takenAt: number, id: string): string` / `decodeCursor(cursor: string): { takenAt: number; id: string } | null` em `lib/cursor.ts` (base64url de `JSON.stringify([takenAt, id])`; decode inválido → `null`)
  - `GET /api/photos?cursor&limit&albumId` → 200 `Page<ApiPhoto>` ordenado por `takenAt` desc, `id` desc (keyset: `takenAt < ? OR (takenAt = ? AND id < ?)`); `nextCursor: null` quando acabou; cursor malformado → 400 `validation_error`
  - `PATCH /api/photos/:id` body `movePhotoSchema` → 200 `ApiPhoto` (associa a um álbum do espaço ou remove com `albumId: null`); álbum de outro espaço → 400; foto de outro espaço → 404
  - `DELETE /api/photos/:id` → 204, apaga a linha e os dois objetos do R2; outro espaço → 404

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/photos-list.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, getJson, postJson, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'
import { decodeCursor, encodeCursor } from '../src/lib/cursor'

function patchJson(path: string, body: unknown, cookie: string) {
  return SELF.fetch('https://album.test' + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

function del(path: string, cookie: string) {
  return SELF.fetch('https://album.test' + path, { method: 'DELETE', headers: { cookie } })
}

describe('cursor', () => {
  it('roundtrip e decode de lixo → null', () => {
    const c = encodeCursor(1700000000000, 'abc')
    expect(decodeCursor(c)).toEqual({ takenAt: 1700000000000, id: 'abc' })
    expect(decodeCursor('%%%nao-e-base64%%%')).toBeNull()
    expect(decodeCursor(btoa('{"nao":"array"}'))).toBeNull()
  })
})

describe('GET /api/photos', () => {
  it('pagina por takenAt desc com cursor e termina com nextCursor null', async () => {
    const { cookie } = await setupSpace()
    for (let i = 1; i <= 5; i++) await uploadPhoto(cookie, { takenAt: 1700000000000 + i * 1000 })

    const p1 = await getJson('/api/photos?limit=2', cookie)
    const page1 = (await p1.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page1.items.map((p) => p.takenAt)).toEqual([1700000005000, 1700000004000])
    expect(page1.nextCursor).not.toBeNull()

    const p2 = await getJson(`/api/photos?limit=2&cursor=${page1.nextCursor}`, cookie)
    const page2 = (await p2.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page2.items.map((p) => p.takenAt)).toEqual([1700000003000, 1700000002000])

    const p3 = await getJson(`/api/photos?limit=2&cursor=${page2.nextCursor}`, cookie)
    const page3 = (await p3.json()) as { items: { takenAt: number }[]; nextCursor: string | null }
    expect(page3.items.map((p) => p.takenAt)).toEqual([1700000001000])
    expect(page3.nextCursor).toBeNull()
  })

  it('desempata por id quando takenAt é igual (sem pular nem repetir)', async () => {
    const { cookie } = await setupSpace()
    for (let i = 0; i < 4; i++) await uploadPhoto(cookie, { takenAt: 1700000000000 })
    const p1 = await getJson('/api/photos?limit=3', cookie)
    const page1 = (await p1.json()) as { items: { id: string }[]; nextCursor: string | null }
    const p2 = await getJson(`/api/photos?limit=3&cursor=${page1.nextCursor}`, cookie)
    const page2 = (await p2.json()) as { items: { id: string }[] }
    const ids = [...page1.items, ...page2.items].map((p) => p.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('filtra por albumId; cursor inválido → 400; isolamento entre espaços', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'A' }, cookie)
    const album = (await created.json()) as { id: string }
    await uploadPhoto(cookie, { albumId: album.id })
    await uploadPhoto(cookie)

    const filtered = await getJson(`/api/photos?albumId=${album.id}`, cookie)
    expect(((await filtered.json()) as { items: unknown[] }).items).toHaveLength(1)

    expect((await getJson('/api/photos?cursor=@@@', cookie)).status).toBe(400)

    const intruder = await createSecondSpace()
    const other = await getJson('/api/photos', intruder.cookie)
    expect(((await other.json()) as { items: unknown[] }).items).toHaveLength(0)
  })
})

describe('PATCH e DELETE /api/photos/:id', () => {
  it('move para álbum e de volta para null', async () => {
    const { cookie } = await setupSpace()
    const created = await postJson('/api/albums', { title: 'A' }, cookie)
    const album = (await created.json()) as { id: string }
    const photo = await uploadPhoto(cookie)

    const moved = await patchJson(`/api/photos/${photo.id}`, { albumId: album.id }, cookie)
    expect(((await moved.json()) as { albumId: string | null }).albumId).toBe(album.id)
    const back = await patchJson(`/api/photos/${photo.id}`, { albumId: null }, cookie)
    expect(((await back.json()) as { albumId: string | null }).albumId).toBeNull()
  })

  it('DELETE apaga linha e objetos do R2; intruso recebe 404 e nada muda', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie)
    const keys = photoKeys(spaceId, photo.id)

    const intruder = await createSecondSpace()
    expect((await del(`/api/photos/${photo.id}`, intruder.cookie)).status).toBe(404)
    expect(await env.PHOTOS.get(keys.file)).not.toBeNull()

    expect((await del(`/api/photos/${photo.id}`, cookie)).status).toBe(204)
    expect(await env.PHOTOS.get(keys.file)).toBeNull()
    expect(await env.PHOTOS.get(keys.thumb)).toBeNull()
    const list = await getJson('/api/photos', cookie)
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- photos-list`
Expected: FAIL — `lib/cursor` e rotas GET/PATCH/DELETE inexistentes.

- [ ] **Step 3: Implementar**

`apps/api/src/lib/cursor.ts`:

```ts
export function encodeCursor(takenAt: number, id: string): string {
  const json = JSON.stringify([takenAt, id])
  return btoa(json).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function decodeCursor(cursor: string): { takenAt: number; id: string } | null {
  try {
    const json = atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))
    const parsed: unknown = JSON.parse(json)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'number' ||
      typeof parsed[1] !== 'string'
    )
      return null
    return { takenAt: parsed[0], id: parsed[1] }
  } catch {
    return null
  }
}
```

Adicionar em `apps/api/src/routes/photos.ts` (depois do POST):

```ts
import { zValidator } from '@hono/zod-validator'
import { listPhotosQuerySchema, movePhotoSchema } from '@photo-album/shared'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { decodeCursor, encodeCursor } from '../lib/cursor'

photoRoutes.get(
  '/',
  zValidator('query', listPhotosQuerySchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Query inválida')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const { cursor, limit, albumId } = c.req.valid('query')

    const conditions = [eq(photos.spaceId, spaceId)]
    if (albumId) conditions.push(eq(photos.albumId, albumId))
    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return apiError(c, 400, 'validation_error', 'Cursor inválido')
      const takenAt = new Date(decoded.takenAt)
      conditions.push(
        or(
          lt(photos.takenAt, takenAt),
          and(eq(photos.takenAt, takenAt), lt(photos.id, decoded.id)),
        )!,
      )
    }

    const rows = await db
      .select()
      .from(photos)
      .where(and(...conditions))
      .orderBy(desc(photos.takenAt), desc(photos.id))
      .limit(limit + 1)

    const items = rows.slice(0, limit)
    const last = items[items.length - 1]
    const nextCursor =
      rows.length > limit && last ? encodeCursor(last.takenAt.getTime(), last.id) : null
    return c.json({ items: items.map(toApiPhoto), nextCursor })
  },
)

async function findPhoto(db: ReturnType<typeof getDb>, spaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, id), eq(photos.spaceId, spaceId)))
    .limit(1)
  return row
}

photoRoutes.patch(
  '/:id',
  zValidator('json', movePhotoSchema, (result, c) => {
    if (!result.success) return apiError(c, 400, 'validation_error', 'Dados inválidos')
  }),
  async (c) => {
    const db = getDb(c.env.DB)
    const spaceId = c.get('membership').spaceId
    const row = await findPhoto(db, spaceId, c.req.param('id'))
    if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')

    const { albumId } = c.req.valid('json')
    if (albumId) {
      const [album] = await db
        .select({ id: albums.id })
        .from(albums)
        .where(and(eq(albums.id, albumId), eq(albums.spaceId, spaceId)))
        .limit(1)
      if (!album) return apiError(c, 400, 'validation_error', 'Álbum inválido')
    }
    await db
      .update(photos)
      .set({ albumId })
      .where(and(eq(photos.id, row.id), eq(photos.spaceId, spaceId)))
    return c.json(toApiPhoto({ ...row, albumId }))
  },
)

photoRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const row = await findPhoto(db, spaceId, c.req.param('id'))
  if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')
  await db.delete(photos).where(and(eq(photos.id, row.id), eq(photos.spaceId, spaceId)))
  await c.env.PHOTOS.delete([row.r2Key, row.thumbR2Key])
  return c.body(null, 204)
})
```

(Os imports novos se consolidam no topo do arquivo junto aos existentes.)

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: keyset-paginated photo listing, album moves and deletion"
```

---

### Task 13: Servir arquivos (`GET /api/photos/:id/file` e `/thumb`)

**Files:**
- Modify: `apps/api/src/routes/photos.ts`
- Test: `apps/api/test/photos-serve.test.ts`

**Interfaces:**
- Consumes: `findPhoto` (12); `uploadPhoto`, `createSecondSpace` (helpers); `photoKeys` (11).
- Produces:
  - `GET /api/photos/:id/file` e `GET /api/photos/:id/thumb` (autenticadas) → 200 com corpo do R2, `Content-Type` do metadata, `Cache-Control: private, max-age=31536000, immutable`, `ETag: "<photoId>-file"` / `"<photoId>-thumb"`
  - `If-None-Match` igual ao ETag → 304 sem corpo
  - Foto de outro espaço/inexistente → 404; objeto sumido do R2 (inconsistência) → 404

- [ ] **Step 1: Escrever o teste que falha**

`apps/api/test/photos-serve.test.ts`:

```ts
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createSecondSpace, setupSpace, uploadPhoto } from './helpers'
import { photoKeys } from '../src/lib/r2'

function get(path: string, cookie: string, headers: Record<string, string> = {}) {
  return SELF.fetch('https://album.test' + path, { headers: { cookie, ...headers } })
}

describe('GET /api/photos/:id/file|thumb', () => {
  it('devolve os bytes com content-type, cache privado e etag', async () => {
    const { cookie } = await setupSpace()
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 42])
    const photo = await uploadPhoto(cookie, { fileBytes: bytes })

    const res = await get(`/api/photos/${photo.id}/file`, cookie)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(res.headers.get('etag')).toBe(`"${photo.id}-file"`)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)

    const thumb = await get(`/api/photos/${photo.id}/thumb`, cookie)
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('etag')).toBe(`"${photo.id}-thumb"`)
  })

  it('If-None-Match com o etag → 304', async () => {
    const { cookie } = await setupSpace()
    const photo = await uploadPhoto(cookie)
    const res = await get(`/api/photos/${photo.id}/file`, cookie, {
      'if-none-match': `"${photo.id}-file"`,
    })
    expect(res.status).toBe(304)
  })

  it('intruso → 404; sem sessão → 401; objeto ausente no R2 → 404', async () => {
    const { cookie, spaceId } = await setupSpace()
    const photo = await uploadPhoto(cookie)

    const intruder = await createSecondSpace()
    expect((await get(`/api/photos/${photo.id}/file`, intruder.cookie)).status).toBe(404)

    const anon = await SELF.fetch(`https://album.test/api/photos/${photo.id}/file`)
    expect(anon.status).toBe(401)

    await env.PHOTOS.delete(photoKeys(spaceId, photo.id).file)
    expect((await get(`/api/photos/${photo.id}/file`, cookie)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @photo-album/api test -- photos-serve`
Expected: FAIL — 404 (sub-rotas não existem).

- [ ] **Step 3: Implementar**

Adicionar em `apps/api/src/routes/photos.ts`:

```ts
async function servePhotoObject(
  c: Parameters<Parameters<typeof photoRoutes.get>[1]>[0],
  kind: 'file' | 'thumb',
) {
  const db = getDb(c.env.DB)
  const spaceId = c.get('membership').spaceId
  const row = await findPhoto(db, spaceId, c.req.param('id'))
  if (!row) return apiError(c, 404, 'not_found', 'Foto não encontrada')

  const etag = `"${row.id}-${kind}"`
  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304, {
      etag,
      'cache-control': 'private, max-age=31536000, immutable',
    })
  }

  const object = await c.env.PHOTOS.get(kind === 'file' ? row.r2Key : row.thumbR2Key)
  if (!object) return apiError(c, 404, 'not_found', 'Arquivo não encontrado')

  return c.body(object.body, 200, {
    'content-type': object.httpMetadata?.contentType ?? row.mime,
    'cache-control': 'private, max-age=31536000, immutable',
    etag,
  })
}

photoRoutes.get('/:id/file', (c) => servePhotoObject(c, 'file'))
photoRoutes.get('/:id/thumb', (c) => servePhotoObject(c, 'thumb'))
```

Nota de implementação: se a tipagem de `servePhotoObject` via `Parameters<...>` brigar com o TypeScript, declarar como `Context<AppEnv>` importando `type { Context } from 'hono'` — comportamento idêntico. Atenção à ordem: o Hono casa rotas na ordem de registro; `/:id/file` e `/:id/thumb` devem ser registradas **antes** de qualquer rota `GET /:id` genérica (não temos uma — melhor ainda).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @photo-album/api test && pnpm --filter @photo-album/api typecheck`
Expected: PASS — suíte completa da API verde.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test && git commit -m "feat: serve photo files and thumbs from r2 with private caching"
```

---

### Task 14: Shell mínimo do `apps/web` (SvelteKit SPA) + assets no Worker

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/svelte.config.js`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app.html`
- Create: `apps/web/src/app.d.ts`
- Create: `apps/web/src/routes/+layout.ts`
- Create: `apps/web/src/routes/+page.svelte`
- Modify: `apps/api/wrangler.jsonc` (adicionar o bloco `assets`)

**Interfaces:**
- Consumes: workspace (Task 1); wrangler.jsonc (3).
- Produces: `pnpm --filter @photo-album/web build` gera `apps/web/build/` com `index.html`; o Worker passa a servir esse build (binding `ASSETS`, SPA fallback, `run_worker_first: ["/api/*"]`). O Plano 2 constrói o app de verdade em cima deste shell — Tailwind, PWA e TanStack Query entram lá.

**Sem teste automatizado neste task** (é scaffold de build); a verificação é o build gerar o artefato e o `wrangler dev` servir página + API juntos.

- [ ] **Step 1: Criar o app**

`apps/web/package.json`:

```json
{
  "name": "@photo-album/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "test": "echo 'web: sem testes no plano 1'"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.8",
    "@sveltejs/kit": "^2.27.0",
    "@sveltejs/vite-plugin-svelte": "^6.1.0",
    "svelte": "^5.38.0",
    "svelte-check": "^4.3.0",
    "vite": "^7.1.0"
  }
}
```

`apps/web/svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
  },
}

export default config
```

`apps/web/vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

`apps/web/src/app.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`apps/web/src/app.d.ts`:

```ts
declare global {
  namespace App {}
}

export {}
```

`apps/web/src/routes/+layout.ts`:

```ts
export const ssr = false
export const prerender = false
```

`apps/web/src/routes/+page.svelte`:

```svelte
<h1>Photo Album</h1>
<p>Em construção com carinho. 💛</p>
```

- [ ] **Step 2: Buildar e verificar o artefato**

Run: `pnpm install && pnpm --filter @photo-album/web build && ls apps/web/build/index.html`
Expected: build sem erros; `index.html` existe.

- [ ] **Step 3: Ligar os assets no Worker**

Em `apps/api/wrangler.jsonc`, adicionar (no nível raiz do JSON, junto de `main`):

```jsonc
"assets": {
  "directory": "../web/build",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
},
```

- [ ] **Step 4: Verificar manualmente com wrangler dev**

Run (em background): `pnpm --filter @photo-album/api dev` e depois:
`curl -s http://localhost:8787/api/health` → `{"ok":true}`
`curl -s http://localhost:8787/ | grep -o "Photo Album"` → `Photo Album`
`curl -s http://localhost:8787/rota-que-nao-existe | grep -o "Photo Album"` → `Photo Album` (SPA fallback)
Encerrar o processo ao final.

- [ ] **Step 5: Rodar a suíte inteira (garantir que nada quebrou)**

Run: `pnpm test && pnpm typecheck`
Expected: PASS em shared e api; web sem testes ainda.

- [ ] **Step 6: Commit**

```bash
git add apps/web apps/api/wrangler.jsonc pnpm-lock.yaml && git commit -m "feat: sveltekit spa shell served by the worker as static assets"
```

---

### Task 15: CI no GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: scripts raiz `lint`/`typecheck`/`test` (Task 1) e builds dos pacotes.
- Produces: workflow `CI` rodando em PRs e pushes na `main`: install → lint → build do web (o typecheck do web precisa do `svelte-kit sync`, que o build garante) → typecheck → testes.

- [ ] **Step 1: Criar o workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm --filter @photo-album/web build
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2: Validar a sintaxe localmente**

Run: `pnpm lint && pnpm --filter @photo-album/web build && pnpm typecheck && pnpm test`
Expected: PASS — é exatamente a sequência do workflow. (A execução real no Actions é conferida no Task 16, após o push.)

- [ ] **Step 3: Commit**

```bash
git add .github && git commit -m "ci: lint, typecheck, build and tests on pull requests and main"
```

---

### Task 16: Provisionar Cloudflare, deploy e README

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `apps/api/wrangler.jsonc` (preencher `database_id` real)
- Modify: `README.md` (instruções completas)

**Interfaces:**
- Consumes: tudo anterior.
- Produces: Worker `photo-album` no ar em `https://photo-album.<subdomínio>.workers.dev`, com D1 migrado e R2 conectado; deploy automático a cada push na `main`; README reproduzível por terceiros.

**⚠️ Este task precisa do Erick:** login na Cloudflare e criação do token de API são ações da conta dele. Os comandos estão prontos; rodar juntos.

- [ ] **Step 1: Autenticar e provisionar (ação do usuário + agente)**

O Erick roda `! npx wrangler login` (abre o navegador). Depois, a partir de `apps/api/`:

```bash
npx wrangler d1 create photo-album
npx wrangler r2 bucket create photo-album-photos
```

Copiar o `database_id` que o `d1 create` imprime para `apps/api/wrangler.jsonc` (substituindo `TODO-TASK-16`).

- [ ] **Step 2: Aplicar migrations e fazer o primeiro deploy manual**

```bash
pnpm --filter @photo-album/web build
cd apps/api
npx wrangler d1 migrations apply photo-album --remote
npx wrangler deploy
```

Verificar: `curl -s https://photo-album.<subdominio>.workers.dev/api/health` → `{"ok":true}`; abrir a URL no navegador → página "Photo Album".

- [ ] **Step 3: Configurar segredos do GitHub (ação do usuário + agente)**

O Erick cria um token de API em dash.cloudflare.com → My Profile → API Tokens → template "Edit Cloudflare Workers" (adicionar permissão D1:Edit). Depois:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

(`ACCOUNT_ID` aparece em `npx wrangler whoami`.)

- [ ] **Step 4: Criar o workflow de deploy**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @photo-album/web build
      - name: Apply D1 migrations
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/api
          command: d1 migrations apply photo-album --remote
      - name: Deploy Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/api
          command: deploy
```

- [ ] **Step 5: Reescrever o README**

Substituir o `README.md` por:

```markdown
# Photo Album

Álbum de fotos colaborativo para casais — PWA rodando inteiro na Cloudflare
(Workers + D1 + R2), no plano gratuito. Um Worker só serve a API (Hono) e o
front (SvelteKit); as fotos ficam num bucket R2 privado.

## Stack

- `apps/web` — Svelte 5 + SvelteKit (SPA estática)
- `apps/api` — Hono em Cloudflare Workers, D1 via Drizzle, R2
- `packages/shared` — schemas Zod compartilhados

## Desenvolvimento local

Pré-requisitos: Node 22+, pnpm 10+.

​```bash
pnpm install
pnpm --filter @photo-album/api exec wrangler d1 migrations apply photo-album --local
pnpm --filter @photo-album/api dev   # API em :8787 (D1/R2 locais)
pnpm --filter @photo-album/web dev   # front em :5173, proxy de /api
pnpm test                            # suíte completa
​```

## Subindo a sua instância

1. Crie uma conta na [Cloudflare](https://dash.cloudflare.com) (grátis).
2. `npx wrangler login`
3. Em `apps/api/`: `npx wrangler d1 create photo-album` e copie o
   `database_id` para `wrangler.jsonc`.
4. `npx wrangler r2 bucket create photo-album-photos`
5. `pnpm --filter @photo-album/web build`
6. Em `apps/api/`: `npx wrangler d1 migrations apply photo-album --remote`
   e `npx wrangler deploy`.
7. Abra a URL do Worker e siga o setup inicial para criar sua conta e o
   espaço do casal. Convide sua pessoa favorita. 💛

Para deploy automático a cada push, configure os secrets
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub (workflow em
`.github/workflows/deploy.yml`).
```

⚠️ Mesmo aviso do Task 1: os fences internos acima têm um U+200B na frente só para caberem neste bloco — no `README.md` real, usar ```` ``` ```` puro.

- [ ] **Step 6: Commit, push e verificação final**

```bash
git add -A && git commit -m "ci: automated deploy to cloudflare and full readme"
git push -u origin main
```

Acompanhar `gh run watch` até CI e Deploy ficarem verdes; conferir `curl -s https://photo-album.<subdominio>.workers.dev/api/health`.

---

## Verificação final do Plano 1

Ao concluir os 16 tasks:

1. `pnpm lint && pnpm typecheck && pnpm test` — tudo verde localmente.
2. Suíte da API cobre: setup único, login/logout/me, convite (uso único, expiração, owner-only), álbuns (CRUD + isolamento), fotos (upload → R2+D1, paginação keyset, mover, excluir, servir com cache/304, isolamento).
3. Worker no ar servindo `/api/health` e a página shell.
4. CI e Deploy verdes no GitHub Actions.
5. Pronto para o Plano 2 (PWA: telas de auth, timeline, upload com fila, álbuns, Tailwind, instalação na home).
