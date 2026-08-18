<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { fetchSetupStatus } from '$lib/api/setup'
  import SetupForm from '$lib/components/SetupForm.svelte'

  const queryClient = useQueryClient()

  onMount(async () => {
    try {
      if (!(await fetchSetupStatus()).needed) goto('/login', { replaceState: true })
    } catch {
      // erro na checagem: o POST /api/setup responde 409 se já houver conta
    }
  })
</script>

<svelte:head><title>Começar — Photo Album</title></svelte:head>

<h1 class="font-display text-4xl italic">Começar o álbum</h1>
<p class="mb-8 mt-2 text-texto-suave">Crie a primeira conta e dê um nome ao espaço de vocês.</p>
<SetupForm
  onSuccess={(s) => {
    queryClient.setQueryData(['me'], s)
    goto('/')
  }}
/>
