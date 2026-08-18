// Desvio do brief: "vite-plugin-pwa/svelte" só declara `virtual:pwa-register/svelte` (o hook
// `useRegisterSW`); nosso +layout.svelte usa `registerSW` puro (código do brief), cujo tipo vem
// de "vite-plugin-pwa/vanillajs". "pwa-assets" foi removido: só é relevante para quem usa a
// integração `pwaAssets` (geração on-the-fly), que não é o nosso caso (geramos os PNGs uma vez
// via assets-generator) — mantê-lo falha o typecheck porque referencia
// `@vite-pwa/assets-generator/api`, pacote que não é dependência do projeto.
/// <reference types="vite-plugin-pwa/vanillajs" />
/// <reference types="vite-plugin-pwa/info" />

declare global {
  namespace App {}
}

export {}
