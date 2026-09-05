<script lang="ts">
  import { registry } from '../lib/game/registry'
  export let juegoId: string
  export let onAction: (a:any)=>void
  $: comp = registry[juegoId]?.Component
</script>
{#if comp}
  <svelte:component this={comp} onAction={onAction} />
{:else}
  <div class="card" role="alert">
    <h2>Juego no disponible</h2>
    <p class="muted">Esta versión no tiene registrado el juego <code>{juegoId}</code>.</p>
  </div>
{/if}
