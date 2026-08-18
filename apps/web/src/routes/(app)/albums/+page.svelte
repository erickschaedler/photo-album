<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { createAlbum, listAlbums } from '$lib/api/albums'
  import { photoThumbUrl } from '$lib/api/photos'
  import { toast } from '$lib/toast.svelte'
  import Carregando from '$lib/components/Carregando.svelte'

  const queryClient = useQueryClient()
  const albums = createQuery(() => ({ queryKey: ['albums'], queryFn: listAlbums }))

  let creating = $state(false)
  let title = $state('')

  const create = createMutation(() => ({
    mutationFn: () => createAlbum({ title: title.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      toast('Álbum criado')
      title = ''
      creating = false
    },
    onError: () => toast('Não deu para criar o álbum', 'error'),
  }))
</script>

<svelte:head><title>Álbuns — Photo Album</title></svelte:head>

<div class="px-4 pt-6">
  <div class="flex items-baseline justify-between">
    <h1 class="font-display text-2xl italic">Álbuns</h1>
    <button type="button" onclick={() => (creating = !creating)} class="text-sm text-ambar">
      Novo álbum
    </button>
  </div>

  {#if creating}
    <form
      onsubmit={(e) => {
        e.preventDefault()
        if (title.trim() && !create.isPending) create.mutate()
      }}
      class="mt-4 flex gap-2"
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={title}
        autofocus
        placeholder="Nome do álbum"
        aria-label="Nome do álbum"
        class="min-w-0 flex-1 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-ambar"
      />
      <button
        type="submit"
        disabled={create.isPending}
        class="rounded-lg bg-ambar px-4 text-sm font-medium text-fundo disabled:opacity-60"
      >
        Criar
      </button>
    </form>
  {/if}

  {#if albums.isPending}
    <Carregando />
  {:else if albums.isError}
    <p class="pt-16 text-center text-texto-suave">
      Não deu para carregar os álbuns. Recarregue a página.
    </p>
  {:else if albums.data.length === 0 && !creating}
    <p class="pt-20 text-center text-texto-suave">
      Nenhum álbum ainda. Crie o primeiro — "Viagens"? "Nós"?
    </p>
  {:else}
    <div class="mt-6 grid grid-cols-2 gap-3">
      {#each albums.data as album (album.id)}
        <a href={`/albums/${album.id}`} class="block">
          <div class="aspect-square overflow-hidden rounded-xl bg-superficie">
            {#if album.coverPhotoId}
              <img
                src={photoThumbUrl(album.coverPhotoId)}
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
              />
            {:else}
              <div
                class="flex h-full items-center justify-center font-display text-4xl italic text-borda"
              >
                {album.title.slice(0, 1)}
              </div>
            {/if}
          </div>
          <p class="mt-1.5 truncate text-sm text-texto">{album.title}</p>
          <p class="font-mono text-xs text-texto-suave">
            {album.photoCount}
            {album.photoCount === 1 ? 'foto' : 'fotos'}
          </p>
        </a>
      {/each}
    </div>
  {/if}
</div>
