# Photo Album — Design da v1

**Data:** 2026-08-17
**Status:** aprovado

## Contexto e objetivo

Photo album colaborativo do casal, presente de aniversário de namoro. Os dois
adicionam fotos ao longo do tempo (viagens, datas, momentos), organizadas em
álbuns e numa linha do tempo. O repositório é público
(github.com/erickschaedler/photo-album) para que outras pessoas consigam subir
a própria instância.

Este projeto substitui os antigos `front-photo-album` (React 18 + MUI) e
`back-photo-album` (.NET 6 + MySQL), abandonados em 2024 — recomeço do zero,
sem herdar código.

**Possível comercialização futura:** não construímos nada multi-cliente agora,
mas o modelo de dados nasce ancorado em "espaços" para não fechar essa porta.

## Decisões de produto

- **Plataforma:** PWA mobile-first — site responsivo instalável na tela
  inicial do celular, com upload direto da galeria. Sem loja de apps.
- **Escopo da v1:** upload de fotos, login do casal, álbuns/coleções e linha
  do tempo cronológica. Fora da v1: legendas, comentários, favoritos, E2E
  tests, foto em múltiplos álbuns, guarda dos originais brutos.
- **Acesso:** instância privada. A primeira conta é criada num setup inicial;
  a segunda pessoa entra por link de convite. Não existe registro aberto.

## Arquitetura

Um único Cloudflare Worker roda tudo em produção: responde `/api/*` com a API
Hono e serve o restante como assets estáticos (build do SvelteKit). Fotos num
bucket R2 privado; dados num banco D1 (SQLite). Tudo no plano gratuito da
Cloudflare (Workers 100k req/dia, D1 5 GB, R2 10 GB).

```
Celular/navegador (PWA Svelte)
        │  HTTPS (mesma origem, sem CORS)
        ▼
Cloudflare Worker ── /api/* → Hono (auth, álbuns, fotos, convites)
        │                │
        │ demais rotas   ├── D1 (SQLite): usuários, sessões, espaços, álbuns, fotos
        ▼                └── R2: arquivos das fotos (processadas + thumbnails)
  Assets estáticos (SvelteKit buildado)
```

Alternativas descartadas: Pages + Worker separados (CORS e dois deploys sem
benefício); framework full-stack SSR na Cloudflare (álbum atrás de login não
precisa de SSR/SEO).

## Stack

| Camada         | Escolha                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| Web            | Svelte 5 (runes) + SvelteKit em modo SPA (`adapter-static` com fallback) |
| Estilo         | Tailwind CSS                                                             |
| PWA            | `@vite-pwa/sveltekit` (manifest + instalação na home)                    |
| Dados no front | TanStack Query (`@tanstack/svelte-query`)                                |
| API            | Hono em Cloudflare Workers                                               |
| Banco          | D1 via Drizzle ORM (schema tipado + migrations versionadas)              |
| Fotos          | R2 via binding nativo do Worker                                          |
| Validação      | Zod, schemas compartilhados em `packages/shared`                         |
| Monorepo       | pnpm workspaces (sem Turborepo — dois apps não justificam)               |

O SvelteKit é usado só como framework de front (roteamento por arquivos,
layouts); a API é exclusivamente o Hono em `apps/api`, reusável por qualquer
front.

## Estrutura do repositório

```
photo-album/
├── apps/
│   ├── web/                # Svelte 5 + SvelteKit (SPA) + TypeScript
│   │   ├── src/
│   │   │   ├── routes/     # file-based
│   │   │   │   ├── (auth)/ # login, setup, aceitar convite
│   │   │   │   └── (app)/  # timeline, álbuns, upload
│   │   │   ├── lib/
│   │   │   │   ├── components/
│   │   │   │   └── api/    # client da API
│   │   │   └── app.css     # Tailwind
│   │   └── svelte.config.js
│   └── api/                # Hono + Cloudflare Workers
│       ├── src/
│       │   ├── routes/     # auth.ts, albums.ts, photos.ts, invites.ts
│       │   ├── db/         # schema Drizzle + migrations
│       │   └── lib/        # sessões, hash de senha, r2
│       └── wrangler.jsonc  # bindings D1 + R2 + assets do web
├── packages/
│   └── shared/             # schemas Zod + tipos usados por web e api
├── docs/
└── package.json            # workspace root
```

**Dev local:** `pnpm dev` sobe o Vite (front com hot reload) com proxy para o
`wrangler dev` (API com D1 e R2 simulados pelo Miniflare). Roda sem conta na
Cloudflare.

## Modelo de dados (D1 / Drizzle)

```
users          id, name, email, password_hash, created_at
sessions       id, token_hash, user_id, expires_at
spaces         id, name, created_at              ← "o espaço do casal"
space_members  space_id, user_id, role, joined_at  (role: owner | member)
invites        id, token_hash, space_id, created_by, expires_at, used_at
albums         id, space_id, title, description, cover_photo_id, created_at
photos         id, space_id, album_id?, uploaded_by, r2_key, thumb_r2_key,
               width, height, size_bytes, taken_at, created_at
```

Regras estruturais:

- Todo recurso (foto, álbum, convite) pertence a um `space_id` e **toda query
  da API filtra por espaço**. Isso elimina IDOR por construção (bug do
  projeto antigo) e é o formato multi-cliente de amanhã.
- Uma foto pertence a no máximo um álbum (`album_id` opcional). Foto em
  vários álbuns viraria tabela de junção numa migration futura.
- `taken_at` vem do EXIF extraído no cliente; se ausente, usa a data do
  upload.

## Fluxos

### Setup e convite

1. Com o banco vazio, a rota `/setup` cria a primeira conta + o espaço.
   Depois disso, `/setup` fica bloqueada permanentemente.
2. O owner gera link de convite (`/invite/<token>`), validade de 7 dias, uso
   único. A convidada abre, cria a conta e entra no espaço como `member`.
   Tokens de convite são guardados com hash, nunca em claro.

### Autenticação

- Login com e-mail e senha. Hash de senha com **PBKDF2 via WebCrypto**
  (bcrypt não roda em Workers).
- Sessão persistida no D1, identificada por cookie **HttpOnly, Secure,
  SameSite=Lax**; token guardado com hash. Validade de 30 dias renovável.
- Middleware do Hono valida a sessão em toda rota protegida.

### Upload

1. Seleção de múltiplas fotos da galeria.
2. **Processamento no cliente antes do upload:** extrai a data EXIF
   (`taken_at`), redimensiona para no máx. ~2560px em alta qualidade e gera
   thumbnail ~400px. Resolve três problemas: HEIC do iPhone vira formato
   exibível em qualquer navegador, upload rápido em 4G, e os 10 GB do R2
   rendem ~10 mil fotos.
3. `POST /api/photos` (multipart) → o Worker grava os dois arquivos no R2 e
   os metadados no D1. Sem URLs pré-assinadas: menos segredos e o fluxo
   funciona igual no dev local.

**Trade-off aceito:** o arquivo original bruto não é guardado. Para
visualização em tela, 2560px de alta qualidade é indistinguível; guarda de
originais pode ser adicionada depois.

### Timeline e álbuns

- **Timeline (tela inicial):** `GET /api/photos` paginado por cursor,
  ordenado por `taken_at` desc; o front agrupa por mês/ano com scroll
  infinito.
- **Álbuns:** criar/renomear/excluir, escolher capa, mover fotos para um
  álbum. Grade de álbuns com capa + contagem.
- **Servir fotos:** `GET /api/photos/:id/file` e `/thumb` com checagem de
  sessão + espaço; streaming do R2 com cache privado no navegador (ETag +
  Cache-Control). Bucket 100% privado, nenhuma URL pública.

## Tratamento de erros

- **API:** erro padronizado `{ error: { code, message } }`. Zod inválido →
  400 com detalhes; sem sessão → 401; recurso de outro espaço ou inexistente
  → **404 nos dois casos** (não vaza existência). Handler global do Hono →
  500 + log estruturado (observabilidade da Cloudflare).
- **Upload resiliente:** fila com status individual por foto (enviando / ok /
  falhou) e retry por item — falha na foto 7 de 20 não afeta as demais.
- **Web:** TanStack Query com retry em leituras; falhas viram toast, nunca
  tela quebrada.

## Testes

- **API (foco principal):** Vitest + `@cloudflare/vitest-pool-workers` — os
  testes rodam no runtime real dos Workers com D1 e R2 locais (não mocks).
  Cobertura obrigatória: setup/convite/login completos, CRUD de fotos e
  álbuns, paginação, e **isolamento de espaço** (regressão permanente do
  IDOR antigo).
- **Web:** Vitest + Testing Library nos componentes com lógica (fila de
  upload, agrupamento da timeline).
- Desenvolvimento guiado por testes (TDD).

## CI/Deploy (GitHub Actions)

- **PR:** lint (ESLint + Prettier com plugins Svelte) + typecheck + testes.
- **Push na `main`:** tudo acima → migrations no D1 remoto → `wrangler
deploy` (API + build do web num só Worker).
- Secrets no GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **README** com passo a passo reproduzível para terceiros: criar bucket R2 e
  banco D1, rodar migrations, deploy.

## Critérios de sucesso da v1

1. Os dois conseguem logar no celular e instalar o PWA na tela inicial.
2. Upload de várias fotos da galeria funciona em rede móvel, com retry.
3. Timeline mostra as fotos na ordem real dos momentos (EXIF), agrupadas por
   mês.
4. Álbuns organizam as fotos com capa e contagem.
5. Ninguém sem convite acessa nada; testes de isolamento de espaço passam.
6. Uma pessoa de fora clona o repo e sobe a própria instância só seguindo o
   README.
