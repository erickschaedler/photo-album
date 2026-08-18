<script lang="ts">
  import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
  } from '@tanstack/svelte-query'
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import type { ApiPhoto } from '@photo-album/shared'
  import { deleteAlbum, listAlbums, updateAlbum } from '$lib/api/albums'
  import { listPhotos, photoThumbUrl } from '$lib/api/photos'
  import { toast } from '$lib/toast.svelte'
  import Carregando from '$lib/components/Carregando.svelte'
  import PhotoViewer from '$lib/components/PhotoViewer.svelte'

  const queryClient = useQueryClient()
  const albumId = $derived(page.params.id!)

  const albums = createQuery(() => ({ queryKey: ['albums'], queryFn: listAlbums }))
  const album = $derived(albums.data?.find((a) => a.id === albumId))

  const photosQuery = createInfiniteQuery(() => ({
    queryKey: ['photos', 'album', albumId],
    queryFn: ({ pageParam }) => listPhotos({ cursor: pageParam ?? undefined, limit: 60, albumId }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  }))
  const photos = $derived(photosQuery.data ? photosQuery.data.pages.flatMap((p) => p.items) : [])

  let selected = $state<ApiPhoto | null>(null)

  let renaming = $state(false)
  let newTitle = $state('')
  const rename = createMutation(() => ({
    mutationFn: () => updateAlbum(albumId, { title: newTitle.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      toast('Álbum renomeado')
      renaming = false
    },
    onError: () => toast('Não deu para renomear o álbum', 'error'),
  }))

  let confirmDelete = $state(false)
  const remove = createMutation(() => ({
    mutationFn: () => deleteAlbum(albumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['albums'] })
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      toast('Álbum excluído')
      goto('/albums')
    },
    onError: () => toast('Não deu para excluir o álbum', 'error'),
  }))

  let sentinel = $state<HTMLElement | null>(null)
  $effect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          photosQuery.hasNextPage &&
          !photosQuery.isFetchingNextPage
        )
          photosQuery.fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  })
</script>

<svelte:head><title>{album?.title ?? 'Álbum'} — Photo Album</title></svelte:head>

{#if albums.isPending}
  <div class="pt-16"><Carregando /></div>
{:else if !album}
  <div class="px-6 pt-24 text-center">
    <h1 class="font-display text-2xl italic">Álbum não encontrado</h1>
    <a href="/albums" class="mt-3 inline-block text-sm text-ambar">Voltar para os álbuns</a>
  </div>
{:else}
  <div class="px-4 pt-6">
    <a href="/albums" class="text-sm text-texto-suave">← Álbuns</a>
    {#if renaming}
      <form
        onsubmit={(e) => {
          e.preventDefault()
          if (newTitle.trim() && !rename.isPending) rename.mutate()
        }}
        class="mt-2 flex gap-2"
      >
        <input
          bind:value={newTitle}
          aria-label="Novo nome do álbum"
          class="min-w-0 flex-1 rounded-lg border border-borda bg-superficie px-3 py-2 text-sm text-texto outline-none focus:border-ambar"
        />
        <button
          type="submit"
          disabled={rename.isPending}
          class="rounded-lg bg-ambar px-4 text-sm font-medium text-fundo disabled:opacity-60"
        >
          Salvar
        </button>
      </form>
    {:else}
      <div class="mt-1 flex items-baseline justify-between gap-3">
        <h1 class="min-w-0 truncate font-display text-2xl italic">{album.title}</h1>
        <span class="shrink-0 font-mono text-xs text-texto-suave">
          {album.photoCount}
          {album.photoCount === 1 ? 'foto' : 'fotos'}
        </span>
      </div>
    {/if}
    <div class="mt-3 flex gap-4 text-sm">
      <button
        type="button"
        onclick={() => {
          newTitle = album.title
          renaming = !renaming
        }}
        class="text-ambar"
      >
        {renaming ? 'Cancelar' : 'Renomear'}
      </button>
      {#if confirmDelete}
        <button
          type="button"
          disabled={remove.isPending}
          onclick={() => remove.mutate()}
          class="text-erro disabled:opacity-60"
        >
          Confirmar — as fotos voltam para a linha do tempo
        </button>
      {:else}
        <button type="button" onclick={() => (confirmDelete = true)} class="text-erro"
          >Excluir álbum</button
        >
      {/if}
    </div>
  </div>

  {#if photosQuery.isPending}
    <Carregando />
  {:else if photos.length === 0}
    <p class="px-6 pt-16 text-center text-texto-suave">
      Nenhuma foto neste álbum ainda. Envie fotos escolhendo este álbum, ou mova pela linha do
      tempo.
    </p>
  {:else}
    <div class="mt-4 grid grid-cols-3 gap-0.5">
      {#each photos as photo (photo.id)}
        <button
          type="button"
          onclick={() => (selected = photo)}
          class="aspect-square overflow-hidden bg-superficie"
        >
          <img
            src={photoThumbUrl(photo.id)}
            alt=""
            loading="lazy"
            class="h-full w-full object-cover"
          />
        </button>
      {/each}
    </div>
    <div bind:this={sentinel} class="h-1"></div>
    {#if photosQuery.isFetchingNextPage}<Carregando />{/if}
  {/if}

  {#if selected}
    <PhotoViewer photo={selected} onClose={() => (selected = null)} />
  {/if}
{/if}
