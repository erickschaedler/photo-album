<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import type { ApiPhoto } from '@photo-album/shared'
  import { listAlbums, updateAlbum } from '$lib/api/albums'
  import { deletePhoto, movePhoto, photoFileUrl } from '$lib/api/photos'
  import { toast } from '$lib/toast.svelte'

  let { photo, onClose }: { photo: ApiPhoto; onClose: () => void } = $props()

  const queryClient = useQueryClient()
  const albums = createQuery(() => ({ queryKey: ['albums'], queryFn: listAlbums }))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['photos'] })
    queryClient.invalidateQueries({ queryKey: ['albums'] })
  }

  const move = createMutation(() => ({
    mutationFn: (albumId: string | null) => movePhoto(photo.id, albumId),
    onSuccess: () => {
      invalidate()
      toast('Foto movida')
    },
    onError: () => toast('Não deu para mover a foto', 'error'),
  }))

  const setCover = createMutation(() => ({
    mutationFn: (albumId: string) => updateAlbum(albumId, { coverPhotoId: photo.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      toast('Capa do álbum atualizada')
    },
    onError: () => toast('Não deu para definir a capa', 'error'),
  }))

  let confirmDelete = $state(false)
  const remove = createMutation(() => ({
    mutationFn: () => deletePhoto(photo.id),
    onSuccess: () => {
      invalidate()
      toast('Foto excluída')
      onClose()
    },
    onError: () => toast('Não deu para excluir a foto', 'error'),
  }))

  const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
  class="fixed inset-0 z-40 flex flex-col bg-fundo/95 backdrop-blur"
  role="dialog"
  aria-modal="true"
  aria-label="Foto ampliada"
>
  <header class="flex items-center justify-between px-4 py-3">
    <span class="font-display text-sm italic text-texto-suave">
      {dateFormat.format(new Date(photo.takenAt))}
    </span>
    <button type="button" onclick={onClose} class="px-2 py-1 text-sm text-texto-suave"
      >Fechar</button
    >
  </header>

  <div class="flex min-h-0 flex-1 items-center justify-center px-2">
    <img src={photoFileUrl(photo.id)} alt="" class="max-h-full max-w-full object-contain" />
  </div>

  <footer class="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <label class="block">
      <span class="mb-1 block text-xs text-texto-suave">Álbum</span>
      <select
        value={photo.albumId ?? ''}
        disabled={move.isPending}
        onchange={(e) => move.mutate(e.currentTarget.value || null)}
        class="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto"
      >
        <option value="">Sem álbum</option>
        {#each albums.data ?? [] as album (album.id)}
          <option value={album.id}>{album.title}</option>
        {/each}
      </select>
    </label>
    <div class="flex gap-3">
      {#if photo.albumId}
        <button
          type="button"
          disabled={setCover.isPending}
          onclick={() => photo.albumId && setCover.mutate(photo.albumId)}
          class="flex-1 rounded-lg border border-borda py-2 text-sm text-texto disabled:opacity-60"
        >
          Usar como capa
        </button>
      {/if}
      {#if confirmDelete}
        <button
          type="button"
          disabled={remove.isPending}
          onclick={() => remove.mutate()}
          class="flex-1 rounded-lg bg-erro py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          Confirmar exclusão
        </button>
      {:else}
        <button
          type="button"
          onclick={() => (confirmDelete = true)}
          class="flex-1 rounded-lg border border-borda py-2 text-sm text-erro"
        >
          Excluir
        </button>
      {/if}
    </div>
  </footer>
</div>
