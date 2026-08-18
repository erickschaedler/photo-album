<script lang="ts">
  import '../app.css'
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
</script>

<QueryClientProvider client={queryClient}>
  {@render children()}
  <Toast />
</QueryClientProvider>
