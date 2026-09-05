<script lang="ts">
  import { onMount } from 'svelte'
  import Landing from './routes/Landing.svelte'
  import Room from './routes/Room.svelte'

  let path = location.hash || '#/'

  function update(){ path = location.hash || '#/' }
  onMount(()=>{
    window.addEventListener('hashchange', update)
    // manejar redirect de 404.html
    const r = sessionStorage.getItem('redirect')
    if (r) {
      sessionStorage.removeItem('redirect')
      try { history.replaceState(null,'', r) } catch {}
      path = location.hash || '#/'
    }
    // si path vacío, ir a landing
    if (!location.hash) location.hash = '#/'
  })
  $: salaId = (path.match(/#\/sala\/([a-z0-9]{6})/) || [])[1] || ''
</script>

<main>
  {#if path.startsWith('#/sala/')}
    {#key salaId}
      <Room />
    {/key}
  {:else}
    <Landing />
  {/if}
</main>

<style>
  main { min-height: 100vh; }
</style>
