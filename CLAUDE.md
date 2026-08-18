# CLAUDE.md

Contexto do projeto para agentes e contribuidores. Leia antes de mexer no código.

## O que é

Álbum de fotos colaborativo para casais — PWA rodando inteiro na Cloudflare (Workers + D1 + R2),
plano gratuito. Um único Worker serve a API Hono em `/api/*` e o build do SvelteKit como assets
estáticos no resto.

- **Produção:** https://photo-album.photo-album-api.workers.dev
- **Spec da v1:** `docs/superpowers/specs/2026-08-17-photo-album-design.md`
- **Status:** Plano 1 (fundação + API) concluído em 18/08/2026. Plano 2 (PWA de verdade)
  concluído em 18/08/2026 — telas de auth (setup/login/convite), timeline agrupada por mês,
  upload com fila e processamento de imagem no navegador, álbuns (criar/renomear/excluir/capa),
  ajustes (perfil, convite, logout) e PWA instalável (manifest + service worker via
  `@vite-pwa/sveltekit`). Falta deploy/produção — **Task 17**: rodar o setup inicial no Worker
  de produção e medir a latência real do login.

## Estrutura

```
apps/web        SvelteKit SPA (Svelte 5 runes, adapter-static fallback index.html, ssr=false)
apps/api        Hono em Cloudflare Workers · D1 via Drizzle · R2 · testes vitest-pool-workers
packages/shared Schemas Zod + tipos da API (fonte única de validação para web e api)
docs/           Spec e planos de implementação
```

## Comandos

```bash
pnpm install
pnpm test                                  # suíte completa (api + shared)
pnpm typecheck && pnpm lint
pnpm --filter @photo-album/web build       # OBRIGATÓRIO antes de wrangler dev (assets)
pnpm --filter @photo-album/api dev         # API em :8787 com D1/R2 locais (Miniflare)
pnpm --filter @photo-album/web dev         # front em :5173 com proxy de /api → :8787
pnpm --filter @photo-album/api db:generate --name=<nome>   # nova migration (SEM `--` extra!)
npx wrangler d1 migrations apply photo-album --local       # aplicar migration no dev local
```

## Convenções (obrigatórias)

- **Toda query da API filtra por `space_id`.** Recurso de outro espaço ou inexistente → **404 nos
  dois casos** (nunca revelar existência). Testes de isolamento com `createSecondSpace()` são
  obrigatórios para rotas novas.
- Erros sempre `{ error: { code, message } }`; Zod inválido → 400 `validation_error`; sem sessão →
  401 `unauthorized`. Schemas Zod vivem em `packages/shared` e são compartilhados com o front.
- Timestamps em **inteiros ms** no banco (`integer(..., { mode: 'timestamp_ms' })`) e nas respostas.
- Tokens (sessão/convite) guardados **só como hash SHA-256**; senha com PBKDF2-SHA256 100k
  (`src/lib/crypto.ts`). Cookie `session`: HttpOnly, Secure, SameSite=Lax, 30 dias.
- Strings de id em campos opcionais: usar `z.string().min(1)` — string vazia já causou dois bugs
  de bypass de validação (coverPhotoId, albumId).
- TDD: teste falhando primeiro, sempre. Commits em inglês com prefixo convencional.

## Pegadinhas da toolchain (descobertas na prática)

- `@cloudflare/vitest-pool-workers` 0.21 usa o plugin `cloudflareTest` (Vitest 4) e **NÃO isola
  storage entre testes** — o harness compensa com wipe global de D1+R2 por teste em
  `apps/api/test/reset-state.ts` (ordem FK-safe). Cada arquivo de teste tem runtime próprio;
  testes dentro do arquivo compartilham estado até o wipe.
- Os testes NÃO leem `wrangler.jsonc` — a config do Miniflare é explícita em
  `apps/api/vitest.config.ts` (por isso assets/database_id não afetam a suíte).
- `wrangler dev` falha se `apps/web/build` não existir (bloco `assets` do wrangler.jsonc) —
  builde o web antes.
- ESLint flat config não respeita `.gitignore`: diretórios gerados precisam estar em `ignores`
  no `eslint.config.js` (`.wrangler/` já está).
- Prettier formata `.svelte` via `prettier-plugin-svelte` (root). `eslint-plugin-svelte`
  instalado no Plano 2: o bloco de parser TS precisa incluir `**/*.svelte.ts`; a regra
  `svelte/no-navigation-without-resolve` desativada durante a construção incremental das rotas
  do Plano 2 — todas já existem; reavaliar reativar (ver comentário no `eslint.config.js`).
- `beforeEach`/`afterEach` do vitest: arrow function com retorno implícito de um mock
  (chainable) vira cleanup e reinvoca o mock após o teste (unhandled rejection) — usar corpo
  em bloco (`{ ... }`) sempre que o corpo retornar algo "por acidente".
- O caminho do repo tem espaço (`Photo Album`): o alias `$lib` no `apps/web/vite.config.ts`
  (config unificada Vite+Vitest do web) usa `import.meta.dirname`, não `new URL(...).pathname`
  (que codificaria o espaço como `%20`).
- `@vite-pwa/sveltekit@1.1` com Vite 7: `kit.spa: true` dá `ENOENT` no `version.json` — usar
  `kit.spa.fallbackRevision`; `workbox-window` precisa ser dependência runtime (não só dev).
- `skipLibCheck: true` no `tsconfig` do web silencia erros de `.d.ts` de terceiros
  (`workbox-core`) — mas também silencia erros em `.d.ts` próprios, então checar manualmente.
- Testes web em jsdom não cobrem `<canvas>`: `processPhoto` (redimensionar/comprimir foto no
  navegador) só é verificado manualmente no navegador de verdade.

## Deploy (GitHub Actions — não ativar o Git integration da Cloudflare!)

- PR/push → workflow **CI** (lint, build web, typecheck, testes).
- Push na `main` → workflow **Deploy**: mesmas checagens como portão → `wrangler d1 migrations
apply photo-album --remote` → `wrangler deploy`. Secrets: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` (já configurados no repo).
- Recursos: Worker `photo-album`, D1 `photo-album` (id no wrangler.jsonc), bucket R2
  `photo-album-photos`. Ativar o "Workers Builds" da Cloudflare causaria deploy duplicado.

## Pendências conhecidas (absorver na Task 17)

1. **Medir a latência de `/api/auth/login` em produção**: PBKDF2 100k iterações vs limite de
   10ms de CPU do plano gratuito. O formato armazenado (`pbkdf2-sha256$<iter>$...`) já suporta
   migrar a contagem se precisar.
