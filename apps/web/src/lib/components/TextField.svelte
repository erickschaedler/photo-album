<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements'

  let {
    label,
    name,
    type = 'text',
    value = $bindable(''),
    autocomplete,
    required = true,
    minlength,
  }: {
    label: string
    name: string
    type?: string
    value?: string
    autocomplete?: HTMLInputAttributes['autocomplete']
    required?: boolean
    minlength?: number
  } = $props()
</script>

<label class="block">
  <span class="mb-1 block text-sm text-texto-suave">{label}</span>
  <input
    {name}
    {type}
    {autocomplete}
    {required}
    {minlength}
    bind:value
    class="w-full rounded-lg border border-borda bg-superficie px-3 py-2.5 text-texto outline-none transition-opacity focus:border-ambar"
  />
</label>
