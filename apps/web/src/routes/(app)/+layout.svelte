<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { fetchMe } from '$lib/api/auth'
  import { ApiError } from '$lib/api/client'
  import Carregando from '$lib/components/Carregando.svelte'

  let { children } = $props()

  const me = createQuery(() => ({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
  }))

  $effect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) goto('/login')
  })

  const links = [
    { href: '/', label: 'Linha do tempo', d: 'M4 6h16M4 12h16M4 18h10' },
    { href: '/albums', label: 'Álbuns', d: 'M8 4h12v12H8zM4 8h12v12H4z' },
    { href: '/upload', label: 'Enviar', d: 'M12 16V5m0 0l-4 4m4-4l4 4M5 19h14' },
    { href: '/settings', label: 'Ajustes', d: 'M4 7h9m4 0h3M4 17h3m4 0h9M13 5v4M7 15v4' },
  ]
</script>

{#if me.isPending}
  <div class="pt-24"><Carregando /></div>
{:else if me.isSuccess}
  <main class="mx-auto w-full max-w-lg pb-24">
    {@render children()}
  </main>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <div class="mx-auto flex max-w-lg">
      {#each links as link (link.href)}
        <a
          href={link.href}
          aria-current={page.url.pathname === link.href ? 'page' : undefined}
          class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] {page.url.pathname ===
          link.href
            ? 'text-ambar'
            : 'text-texto-suave'}"
        >
          <svg
            viewBox="0 0 24 24"
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d={link.d} />
          </svg>
          {link.label}
        </a>
      {/each}
    </div>
  </nav>
{:else}
  <p class="px-6 pt-24 text-center text-texto-suave">
    Não deu para carregar sua sessão. Verifique a conexão e recarregue a página.
  </p>
{/if}
