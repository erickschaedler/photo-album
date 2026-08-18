<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    busy = false,
    busyLabel = 'Aguarde…',
    children,
  }: { busy?: boolean; busyLabel?: string; children: Snippet } = $props()
</script>

<button
  type="submit"
  disabled={busy}
  class="w-full rounded-lg bg-ambar py-3 font-medium text-fundo transition-opacity disabled:opacity-60"
>
  {#if busy}{busyLabel}{:else}{@render children()}{/if}
</button>
