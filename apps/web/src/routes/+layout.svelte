<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { pwaInfo } from 'virtual:pwa-info'
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query'
  import { ApiError } from '$lib/api/client'
  import Toast from '$lib/components/Toast.svelte'

  let { children } = $props()

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Erros 4xx são definitivos (401/404/validação) — só repete falha de rede/5xx
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
        staleTime: 30_000,
      },
    },
  })

  const webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '')

  onMount(async () => {
    if (pwaInfo) {
      const { registerSW } = await import('virtual:pwa-register')
      registerSW({ immediate: true })
    }
  })
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- linkTag é gerado pelo plugin, não é input de usuário -->
  {@html webManifestLink}
</svelte:head>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <Toast />
</QueryClientProvider>
