import tseslint from 'typescript-eslint'

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
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['**/*.ts'] })),
)
