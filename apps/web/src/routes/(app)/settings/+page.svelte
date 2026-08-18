<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { fetchMe, logout } from '$lib/api/auth'
  import { createInvite } from '$lib/api/invites'
  import { toast } from '$lib/toast.svelte'

  const queryClient = useQueryClient()
  const me = createQuery(() => ({ queryKey: ['me'], queryFn: fetchMe }))

  let inviteUrl = $state('')
  const invite = createMutation(() => ({
    mutationFn: createInvite,
    onSuccess: async (data) => {
      inviteUrl = new URL(data.url, location.origin).toString()
      try {
        await navigator.clipboard.writeText(inviteUrl)
        toast('Link do convite copiado')
      } catch {
        toast('Convite criado — copie o link abaixo')
      }
    },
    onError: () => toast('Não deu para criar o convite', 'error'),
  }))

  const exit = createMutation(() => ({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      goto('/login')
    },
    onError: () => toast('Não deu para sair. Tente de novo.', 'error'),
  }))
</script>

<svelte:head><title>Ajustes — Photo Album</title></svelte:head>

<div class="px-4 pt-6">
  <h1 class="font-display text-2xl italic">Ajustes</h1>

  {#if me.isSuccess}
    <section class="mt-6 rounded-xl bg-superficie p-4">
      <p class="text-texto">{me.data.user.name}</p>
      <p class="text-sm text-texto-suave">{me.data.user.email}</p>
      <p class="mt-2 font-mono text-xs text-texto-suave">
        espaço “{me.data.space.name}” · {me.data.space.role === 'owner' ? 'dono' : 'membro'}
      </p>
    </section>

    {#if me.data.space.role === 'owner'}
      <section class="mt-4 rounded-xl bg-superficie p-4">
        <h2 class="text-sm text-texto">Convite</h2>
        <p class="mt-1 text-xs text-texto-suave">
          Chame quem divide este álbum com você. O link vale por 7 dias e só pode ser usado uma vez.
        </p>
        <button
          type="button"
          onclick={() => invite.mutate()}
          disabled={invite.isPending}
          class="mt-3 w-full rounded-lg bg-ambar py-2.5 text-sm font-medium text-fundo disabled:opacity-60"
        >
          Criar link de convite
        </button>
        {#if inviteUrl}
          <p class="mt-3 break-all rounded-lg bg-fundo p-2 font-mono text-xs text-texto-suave">
            {inviteUrl}
          </p>
        {/if}
      </section>
    {/if}

    <button
      type="button"
      onclick={() => exit.mutate()}
      disabled={exit.isPending}
      class="mt-8 w-full rounded-lg border border-borda py-2.5 text-sm text-erro disabled:opacity-60"
    >
      Sair
    </button>
  {/if}
</div>
