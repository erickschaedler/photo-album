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

```bash
pnpm install
pnpm --filter @photo-album/api exec wrangler d1 migrations apply photo-album --local
pnpm --filter @photo-album/api dev   # API em :8787 (D1/R2 locais)
pnpm --filter @photo-album/web dev   # front em :5173, proxy de /api
pnpm test                            # suíte completa
```

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
