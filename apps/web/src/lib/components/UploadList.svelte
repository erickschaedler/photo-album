<script lang="ts">
  import type { UploadItem } from '$lib/upload/queue.svelte'

  let { items, onRetry }: { items: UploadItem[]; onRetry: (id: number) => void } = $props()

  const labels: Record<UploadItem['status'], string> = {
    queued: 'Na fila',
    processing: 'Preparando…',
    uploading: 'Enviando…',
    done: 'Enviada',
    error: 'Falhou',
  }
</script>

{#if items.length > 0}
  <ul class="mt-6 space-y-2">
    {#each items as item (item.id)}
      <li
        class="flex items-center justify-between gap-3 rounded-lg bg-superficie px-3 py-2 text-sm"
      >
        <span class="truncate text-texto">{item.file.name}</span>
        {#if item.status === 'error'}
          <span class="flex shrink-0 items-center gap-3">
            <span class="text-erro" title={item.error}>{labels.error}</span>
            <button type="button" onclick={() => onRetry(item.id)} class="text-ambar">
              Tentar de novo
            </button>
          </span>
        {:else}
          <span class="shrink-0 {item.status === 'done' ? 'text-ambar' : 'text-texto-suave'}">
            {labels[item.status]}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
