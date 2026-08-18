import tseslint from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import svelteConfig from './apps/web/svelte.config.js'

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/build/',
      '**/.svelte-kit/',
      '**/drizzle/',
      '**/node_modules/',
      '**/.wrangler/',
    ],
  },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts', '**/*.svelte.ts'] })),
  ...svelte.configs.recommended,
  {
    // eslint-plugin-svelte roteia .svelte e .svelte.ts (runes) pelo svelte-eslint-parser;
    // sem apontar o parser interno de TS aqui, arquivos .svelte.ts quebram o parsing
    // ("Unexpected token interface") assim que usam sintaxe TS fora de <script>.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
  },
  {
    // svelte/no-navigation-without-resolve exige `resolve()` do $app/paths, tipado
    // contra o RouteId já conhecido pelo svelte-kit sync. No Plano 2 os grupos de
    // rota nascem incrementais por task (nav e redirects de auth referenciam
    // /albums, /upload, /settings, /login antes de essas páginas existirem), então
    // resolve() não compilaria até a rota alvo nascer. Reavaliar quando todas as
    // rotas do plano existirem.
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
)
