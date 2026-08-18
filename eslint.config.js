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
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
)
