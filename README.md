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
pnpm --filter @photo-album/web build # gera apps/web/build para o wrangler dev servir
pnpm --filter @photo-album/api dev   # API em :8787 (D1/R2 locais)
pnpm --filter @photo-album/web dev   # front em :5173, proxy de /api
pnpm test                            # suíte completa
```

## Subindo a sua instância

1. `pnpm install`
2. Crie uma conta na [Cloudflare](https://dash.cloudflare.com) (grátis).
3. `npx wrangler login`
4. Em `apps/api/`: `npx wrangler d1 create photo-album` e copie o
   `database_id` para `wrangler.jsonc`.
5. `npx wrangler r2 bucket create photo-album-photos`
6. `pnpm --filter @photo-album/web build`
7. Em `apps/api/`: `npx wrangler d1 migrations apply photo-album --remote`
   e `npx wrangler deploy`.
8. Abra a URL do Worker e siga o setup inicial para criar sua conta e o
   espaço do casal. Convide sua pessoa favorita. 💛

Para deploy automático a cada push, configure os secrets
`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub (workflow em
`.github/workflows/deploy.yml`).

## Instalar no celular (PWA)

Abra a URL da sua instância no navegador do celular:

- **iPhone (Safari):** toque em Compartilhar → "Adicionar à Tela de Início".
- **Android (Chrome):** toque no prompt de instalação que aparece
  automaticamente, ou no menu ⋮ → "Instalar app" / "Adicionar à tela
  inicial".

O app abre em tela cheia, sem a barra do navegador, como qualquer outro
app instalado.

A primeira conta é criada em `/setup` (aparece automaticamente na
primeira visita, antes de qualquer conta existir). A segunda pessoa do
casal entra pelo link de convite gerado em **Ajustes** — basta abrir o
link recebido e aceitar com seu nome, e-mail e senha.
