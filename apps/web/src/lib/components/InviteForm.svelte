<script lang="ts">
  import { acceptInvite } from '$lib/api/invites'
  import type { Session } from '$lib/api/auth'
  import { ApiError } from '$lib/api/client'
  import TextField from './TextField.svelte'
  import SubmitButton from './SubmitButton.svelte'

  let { token, onSuccess }: { token: string; onSuccess: (s: Session) => void } = $props()

  let name = $state('')
  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    error = ''
    try {
      onSuccess(await acceptInvite(token, { name, email, password }))
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Erro inesperado. Tente de novo.'
    } finally {
      busy = false
    }
  }
</script>

<form onsubmit={submit} class="space-y-4">
  <TextField label="Seu nome" name="name" autocomplete="name" bind:value={name} />
  <TextField label="E-mail" name="email" type="email" autocomplete="email" bind:value={email} />
  <TextField
    label="Senha"
    name="password"
    type="password"
    autocomplete="new-password"
    minlength={8}
    bind:value={password}
  />
  {#if error}<p role="alert" class="text-sm text-erro">{error}</p>{/if}
  <SubmitButton {busy} busyLabel="Entrando…">Entrar no espaço</SubmitButton>
</form>
