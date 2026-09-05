<script lang="ts">
  import { gameStore } from '../../stores/gameStore'
  import { roomStore } from '../../stores/roomStore'
  import { DEFAULT_CONFIG } from './engine'
  import type { HipsterState } from './types'

  export let onAction: (a:any)=>void = ()=>{}

  let state: HipsterState
  let room: any
  let segundos = DEFAULT_CONFIG.segundos
  $: state = $gameStore as HipsterState
  $: room = $roomStore
  $: if (state.phase === 'lobby' && state.config) segundos = state.config.segundos

  function answer(opcion:number){
    if (state.respuestas[room.selfId] !== undefined) return
    onAction({ t:'answer', opcion })
  }
  function start(){ onAction({ t:'startGame', juegoId:'hipster', config: { segundos } }) }
  function next(){ onAction({ t:'next' }) }
  function restart(){ onAction({ t:'restart' }) }
  $: peers = room.peers
  function nombre(pid:string){ return peers.find((p:any)=>p.id===pid)?.name || pid.slice(0,4) }
</script>

{#if state.phase === 'lobby'}
  <div class="card">
    <h2>Hipster musical (prueba)</h2>
    <p class="muted">Escucha el clip y adivina la canción. 5 rondas.</p>
    {#if room.isHost}
      <label style="display:grid;gap:0.35rem;text-align:left;color:var(--muted);font-size:0.9rem;margin:1rem 0;max-width:240px">
        Segundos por ronda
        <input type="number" min="5" max="300" bind:value={segundos} />
      </label>
      <button on:click={start}>Empezar hipster</button>
    {:else}
      <p class="muted">El anfitrión iniciará la partida.</p>
    {/if}
  </div>
{:else if state.phase === 'pregunta'}
  <div class="card">
    <div style="display:flex;justify-content:space-between"><strong>Ronda {state.ronda+1}/5 · ¿Qué canción es?</strong><span>⏱ {state.timer}s</span></div>
    <audio controls src={state.clipUrl} style="width:100%;margin-top:1rem" aria-label="Clip musical"></audio>
    <div style="display:grid;gap:0.6rem;margin-top:1rem">
      {#each state.opciones as op, idx}
        <button
          on:click={()=>answer(idx)}
          disabled={state.respuestas[room.selfId] !== undefined}
          style="text-align:left;border:1px solid var(--muted)"
        >{String.fromCharCode(65+idx)}. {op} {state.respuestas[room.selfId]===idx ? '✓' : ''}</button>
      {/each}
    </div>
    <p class="muted" style="margin-top:0.8rem">{Object.keys(state.respuestas).length}/{peers.length} han respondido</p>
  </div>
{:else if state.phase === 'resultados'}
  <div class="card">
    <h2>Resultados</h2>
    <p>Correcta: <strong style="color:var(--success)">{state.opciones[state.respuestaCorrecta]}</strong></p>
    <ul>
      {#each Object.entries(state.respuestas) as [pid, ansRaw]}
        {@const ans = ansRaw as number}
        <li>{nombre(pid)}: {String.fromCharCode(65+ans)} {ans===state.respuestaCorrecta ? '✅ +100' : '❌'}</li>
      {/each}
    </ul>
    <h3>Puntos</h3>
    <ul>
      {#each Object.entries(state.puntos).sort((a,b)=>b[1]-a[1]) as [pid, pts]}
        <li>{nombre(pid)}: {pts}</li>
      {/each}
    </ul>
    {#if room.isHost}
      <button on:click={next}>Siguiente</button>
    {:else}
      <p class="muted">Esperando anfitrión...</p>
    {/if}
  </div>
{:else if state.phase === 'final'}
  <div class="card">
    <h2>🏆 Clasificación final</h2>
    <ol>
      {#each Object.entries(state.puntos).sort((a,b)=>b[1]-a[1]) as [pid, pts]}
        <li>{nombre(pid)} — {pts} pts</li>
      {/each}
    </ol>
    {#if room.isHost}
      <button on:click={restart}>Volver al lobby</button>
    {/if}
  </div>
{/if}
