<script lang="ts">
  export let peers: {id:string, name:string}[] = []
  export let hostId: string = ''
</script>
<ul style="list-style:none;padding:0;display:grid;gap:0.4rem">
  {#each peers as p}
    <li style="display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:0.5rem 0.8rem;border-radius:8px">
      <span>{p.name}</span>
      {#if p.id === hostId}<span style="font-size:0.8rem;background:var(--accent);color:var(--bg);padding:2px 6px;border-radius:4px">Anfitrión</span>{/if}
    </li>
  {/each}
  {#if peers.length===0}<li class="muted">Sin jugadores</li>{/if}
</ul>
<p class="muted" style="font-size:0.9rem">{peers.length}/20 jugadores</p>
