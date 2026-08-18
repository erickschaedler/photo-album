import path from 'node:path'
import { sveltekit } from '@sveltejs/kit/vite'
import { SvelteKitPWA } from '@vite-pwa/sveltekit'
import { svelteTesting } from '@testing-library/svelte/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      // `spa: true` (per o brief) faz o plugin ler `.svelte-kit/output/client/_app/version.json`
      // em closeBundle da build SSR para gerar a revision da fallback page — mas nesse ponto o
      // build aninhado do client (@sveltejs/kit) ainda não rodou, e o read falha com ENOENT
      // (confirmado isolando a versão instalada: @vite-pwa/sveltekit 1.1.0 + vite-plugin-pwa 1.3.0
      // + vite 7.3.6 + @sveltejs/kit 2.70.2). `fallbackRevision` é a saída documentada pelo próprio
      // plugin para esse caso — evita o read em disco calculando a revision no momento da build.
      kit: {
        adapterFallback: 'index.html',
        spa: { fallbackRevision: async () => Date.now().toString() },
      },
      manifest: {
        name: 'Photo Album',
        short_name: 'Álbum',
        description: 'O álbum de fotos de vocês',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        background_color: '#141210',
        theme_color: '#141210',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
    svelteTesting(),
  ],
  resolve: {
    alias: {
      $lib: path.resolve(import.meta.dirname, './src/lib'),
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
