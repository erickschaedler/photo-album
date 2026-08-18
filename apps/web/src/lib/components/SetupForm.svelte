<script lang="ts">
  import { runSetup } from '$lib/api/setup'
  import type { Session } from '$lib/api/auth'
  import { ApiError } from '$lib/api/client'
  import TextField from './TextField.svelte'
  import SubmitButton from './SubmitButton.svelte'

  let { onSuccess }: { onSuccess: (s: Session) => void } = $props()

  let name = $state('')
  let spaceName = $state('')
  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    busy = true
    error = ''
    try {
      const session = await runSetup({ name, spaceName, email, password })
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
  <TextField label="Seu nome" name="name" autocomplete="name" bind:value={name} />
  <TextField label="Nome do espaço" name="spaceName" bind:value={spaceName} />
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
  <SubmitButton {busy} busyLabel="Criando…">Começar o álbum</SubmitButton>
</form>
