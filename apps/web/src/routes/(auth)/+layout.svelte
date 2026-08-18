<script lang="ts">
  let { children } = $props()
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
  {@render children()}
</main>
