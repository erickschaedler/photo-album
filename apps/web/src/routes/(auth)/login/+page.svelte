<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { fetchSetupStatus } from '$lib/api/setup'
  import LoginForm from '$lib/components/LoginForm.svelte'

  const queryClient = useQueryClient()

  onMount(async () => {
    try {
      if ((await fetchSetupStatus()).needed) goto('/setup', { replaceState: true })
    } catch {}
  })
</script>

<svelte:head><title>Entrar — Photo Album</title></svelte:head>

<h1 class="font-display text-4xl italic">Nosso álbum</h1>
<p class="mb-8 mt-2 text-texto-suave">Entre para ver a linha do tempo de vocês.</p>
<LoginForm
  onSuccess={(s) => {
    queryClient.setQueryData(['me'], s)
    goto('/')
  }}
/>
