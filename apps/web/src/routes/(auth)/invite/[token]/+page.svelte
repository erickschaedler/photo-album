<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { fetchInvite } from '$lib/api/invites'
  import Carregando from '$lib/components/Carregando.svelte'
  import InviteForm from '$lib/components/InviteForm.svelte'

  const queryClient = useQueryClient()
  const token = $derived(page.params.token!)

  const invite = createQuery(() => ({
    queryKey: ['invite', token],
    queryFn: () => fetchInvite(token),
    retry: false,
  }))
</script>

<svelte:head><title>Convite — Photo Album</title></svelte:head>

{#if invite.isPending}
  <Carregando />
{:else if invite.isError}
  <h1 class="font-display text-3xl italic">Convite inválido</h1>
  <p class="mt-2 text-texto-suave">
    Este link expirou ou já foi usado. Peça um novo link para quem convidou você.
  </p>
{:else}
  <h1 class="font-display text-3xl italic">{invite.data.inviterName} convidou você</h1>
  <p class="mb-8 mt-2 text-texto-suave">
    Crie sua conta para entrar no espaço "{invite.data.spaceName}".
  </p>
  <InviteForm
    {token}
    onSuccess={(s) => {
      queryClient.setQueryData(['me'], s)
      goto('/')
    }}
  />
{/if}
