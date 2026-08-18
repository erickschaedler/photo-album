<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { ApiError } from '$lib/api/client'
  import { fetchInvite } from '$lib/api/invites'
  import Carregando from '$lib/components/Carregando.svelte'
  import InviteForm from '$lib/components/InviteForm.svelte'

  const queryClient = useQueryClient()
  const token = $derived(page.params.token!)

  const invite = createQuery(() => ({
    queryKey: ['invite', token],
    queryFn: () => fetchInvite(token),
  }))
</script>

<svelte:head><title>Convite — Photo Album</title></svelte:head>

{#if invite.isPending}
  <Carregando />
{:else if invite.isError}
  {#if invite.error instanceof ApiError && invite.error.status === 404}
    <h1 class="font-display text-3xl italic">Convite inválido</h1>
    <p class="mt-2 text-texto-suave">
      Este link expirou ou já foi usado. Peça um novo link para quem convidou você.
    </p>
  {:else}
    <h1 class="font-display text-3xl italic">Não deu para carregar o convite</h1>
    <p class="mt-2 text-texto-suave">Verifique a conexão e tente de novo.</p>
    <button
      type="button"
      onclick={() => invite.refetch()}
      class="mt-4 rounded-lg bg-ambar px-4 py-2 text-sm font-medium text-fundo"
    >
      Tentar de novo
    </button>
  {/if}
{:else}
  <h1 class="font-display text-3xl italic">{invite.data.inviterName} convidou você</h1>
  <p class="mb-8 mt-2 text-texto-suave">
    Crie sua conta para entrar no espaço “{invite.data.spaceName}”.
  </p>
  <InviteForm
    {token}
    onSuccess={(s) => {
      queryClient.setQueryData(['me'], s)
      goto('/')
    }}
  />
{/if}
