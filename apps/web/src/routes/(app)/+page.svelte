<script lang="ts">
  import { createInfiniteQuery } from '@tanstack/svelte-query'
  import { listPhotos, photoThumbUrl } from '$lib/api/photos'
  import { groupByMonth } from '$lib/timeline/group'
  import Carregando from '$lib/components/Carregando.svelte'

  const query = createInfiniteQuery(() => ({
    queryKey: ['photos', 'timeline'],
    queryFn: ({ pageParam }) => listPhotos({ cursor: pageParam ?? undefined, limit: 60 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  }))

  const photos = $derived(query.data ? query.data.pages.flatMap((p) => p.items) : [])
  const groups = $derived(groupByMonth(photos))

  let sentinel = $state<HTMLElement | null>(null)
  $effect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && query.hasNextPage && !query.isFetchingNextPage)
          query.fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  })
</script>

<svelte:head><title>Linha do tempo — Photo Album</title></svelte:head>

{#if query.isPending}
  <div class="pt-16"><Carregando /></div>
{:else if query.isError}
  <p class="px-6 pt-24 text-center text-texto-suave">
    Não deu para carregar as fotos. Verifique a conexão e recarregue a página.
  </p>
{:else if photos.length === 0}
  <div class="px-6 pt-28 text-center">
    <h1 class="font-display text-3xl italic">Nenhuma foto ainda</h1>
    <p class="mt-3 text-texto-suave">Toquem em Enviar e comecem a linha do tempo de vocês.</p>
  </div>
{:else}
  {#each groups as group (group.key)}
    <section>
      <h2 class="flex items-baseline gap-3 px-4 pb-2 pt-6">
        <span class="font-display text-xl italic text-ambar">{group.label}</span>
        <span class="h-px flex-1 bg-borda"></span>
        <span class="font-mono text-xs text-texto-suave">{group.photos.length}</span>
      </h2>
      <div class="grid grid-cols-3 gap-0.5">
        {#each group.photos as photo (photo.id)}
          <div class="aspect-square overflow-hidden bg-superficie">
            <img
              src={photoThumbUrl(photo.id)}
              alt=""
              loading="lazy"
              class="h-full w-full object-cover"
            />
          </div>
        {/each}
      </div>
    </section>
  {/each}
  <div bind:this={sentinel} class="h-1"></div>
  {#if query.isFetchingNextPage}<Carregando />{/if}
{/if}
