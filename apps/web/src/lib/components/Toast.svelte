<script lang="ts">
  import { dismiss, toastState } from '../toast.svelte'
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
  aria-live="polite"
>
  {#each toastState.items as t (t.id)}
    <button
      type="button"
      onclick={() => dismiss(t.id)}
      class="pointer-events-auto rounded-full px-4 py-2 text-sm shadow-lg {t.kind === 'error'
        ? 'bg-erro text-fundo'
        : 'border border-borda bg-superficie text-texto'}"
    >
      {t.message}
    </button>
  {/each}
</div>
