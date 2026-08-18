<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { listAlbums } from '$lib/api/albums'
  import { uploadPhoto } from '$lib/api/photos'
  import { processPhoto } from '$lib/upload/process'
  import { UploadQueue } from '$lib/upload/queue.svelte'
  import UploadList from '$lib/components/UploadList.svelte'

  const queryClient = useQueryClient()
  const albums = createQuery(() => ({ queryKey: ['albums'], queryFn: listAlbums }))

  let albumId = $state('')
  let input = $state<HTMLInputElement | null>(null)

  const queue = new UploadQueue({
    process: processPhoto,
    upload: (p) =>
      uploadPhoto({
        file: p.file,
        thumb: p.thumb,
        width: p.width,
        height: p.height,
        takenAt: p.takenAt,
        albumId: p.albumId,
      }),
    onPhotoDone: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['albums'] })
    },
  })

  function onFiles() {
    const files = input?.files
    if (files?.length) queue.add([...files], albumId || undefined)
    if (input) input.value = ''
  }
</script>

<svelte:head><title>Enviar — Photo Album</title></svelte:head>

<div class="px-4 pt-6">
  <h1 class="font-display text-2xl italic">Enviar fotos</h1>

  <label class="mt-6 block">
    <span class="mb-1 block text-sm text-texto-suave">Álbum (opcional)</span>
    <select
      bind:value={albumId}
      class="w-full rounded-lg border border-borda bg-superficie px-3 py-2.5 text-texto"
    >
      <option value="">Sem álbum — só na linha do tempo</option>
      {#each albums.data ?? [] as album (album.id)}
        <option value={album.id}>{album.title}</option>
      {/each}
    </select>
  </label>
  {#if albums.isError}
    <p class="mt-1 text-xs text-erro">
      Não deu para carregar os álbuns — dá para enviar sem álbum mesmo assim.
    </p>
  {/if}

  <input
    bind:this={input}
    onchange={onFiles}
    id="file-input"
    type="file"
    accept="image/*"
    multiple
    class="hidden"
  />
  <label
    for="file-input"
    class="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-borda py-10 active:border-ambar"
  >
    <span class="text-ambar">Escolher da galeria</span>
    <span class="text-xs text-texto-suave">Pode selecionar várias de uma vez</span>
  </label>

  <UploadList items={queue.items} onRetry={(id) => queue.retry(id)} />
</div>
