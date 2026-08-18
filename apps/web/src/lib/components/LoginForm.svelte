<script lang="ts">
  import { login, type Session } from '$lib/api/auth'
  import { ApiError } from '$lib/api/client'
  import TextField from './TextField.svelte'
  import SubmitButton from './SubmitButton.svelte'

  let { onSuccess }: { onSuccess: (s: Session) => void } = $props()

  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    error = ''
    try {
      const session = await login({ email, password })
      onSuccess(session)
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.message
      } else {
        error = 'Erro inesperado. Tente de novo.'
      }
    } finally {
      busy = false
    }
  }
</script>

<form onsubmit={submit} class="space-y-4">
  <TextField label="E-mail" name="email" type="email" autocomplete="email" bind:value={email} />
  <TextField
    label="Senha"
    name="password"
    type="password"
    autocomplete="current-password"
    bind:value={password}
  />
  {#if error}<p role="alert" class="text-sm text-erro">{error}</p>{/if}
  <SubmitButton {busy} busyLabel="Entrando…">Entrar</SubmitButton>
</form>
