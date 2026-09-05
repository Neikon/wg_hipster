<script lang="ts">
  import { gameStore } from '../../stores/gameStore'
  import { roomStore } from '../../stores/roomStore'
  import { CATEGORIAS, questionsFor } from './questions'
  import { DEFAULT_CONFIG } from './engine'
  import type { TriviaCategoria, TriviaState } from './types'

  export let onAction: (a:any)=>void = ()=>{}

  let state: TriviaState
  let room: any
  let numPreguntas = DEFAULT_CONFIG.numPreguntas
  let segundos = DEFAULT_CONFIG.segundos
  let categoria: TriviaCategoria = DEFAULT_CONFIG.categoria
  $: state = $gameStore as TriviaState
  $: room = $roomStore
  $: if (state.phase === 'lobby' && state.config) {
    numPreguntas = state.config.numPreguntas
    segundos = state.config.segundos
    categoria = state.config.categoria
  }
  $: preguntas = questionsFor(categoria)
  $: if (numPreguntas > preguntas.length) numPreguntas = preguntas.length

  function answer(opcion:number){
    if (state.respuestas[room.selfId] !== undefined) return
    onAction({ t:'answer', opcion })
  }
  function next(){ onAction({ t:'nextQuestion'}) }
  function restart(){ onAction({ t:'restart'}) }
  function start(){
    onAction({
      t: 'startGame',
      juegoId: 'trivia',
      config: { numPreguntas, segundos, categoria }
    })
  }

  $: preguntasPartida = state.config ? questionsFor(state.config.categoria) : questionsFor(DEFAULT_CONFIG.categoria)
  $: pregunta = state.phase !== 'lobby' && state.phase !== 'final' ? preguntasPartida[state.preguntaIdx] : null
  $: correcta = pregunta ? (pregunta as any).correcta : -1
  $: peers = room.peers
  function nombre(pid:string){ return peers.find((p:any)=>p.id===pid)?.name || pid.slice(0,4) }
</script>

{#if state.phase === 'lobby'}
  <div class="card">
    <h2>Esperando anfitrión...</h2>
    {#if room.isHost}
      <div class="config" aria-label="Configuración de trivia">
        <label>
          Número de preguntas
          <input type="number" min="1" max={preguntas.length} bind:value={numPreguntas} />
        </label>
        <label>
          Segundos por pregunta
          <input type="number" min="5" max="120" bind:value={segundos} />
        </label>
        <label>
          Categoría
          <select bind:value={categoria}>
            {#each CATEGORIAS as item}
              <option value={item.id}>{item.nombre}</option>
            {/each}
          </select>
        </label>
      </div>
      <button on:click={start}>Empezar trivia ({numPreguntas} preguntas)</button>
    {:else}
      <p class="muted">El anfitrión iniciará la partida.</p>
    {/if}
  </div>
{:else if state.phase === 'pregunta' && pregunta}
  <div class="card">
    <div style="display:flex;justify-content:space-between"><strong>Pregunta {state.preguntaIdx+1}/{state.config.numPreguntas}</strong><span>⏱ {state.timer}s</span></div>
    <h2 style="margin-top:1rem">{pregunta.q}</h2>
    <div style="display:grid;gap:0.6rem;margin-top:1rem">
      {#each pregunta.opciones as op, idx}
        <button
          on:click={()=>answer(idx)}
          disabled={state.respuestas[room.selfId] !== undefined}
          style="text-align:left;background:{state.respuestas[room.selfId]===idx ? 'var(--success)' : 'var(--card)'};border:1px solid var(--muted)"
        >{String.fromCharCode(65+idx)}. {op} {state.respuestas[room.selfId]===idx ? '✓' : ''}</button>
      {/each}
    </div>
    <p class="muted" style="margin-top:0.8rem">{Object.keys(state.respuestas).length}/{peers.length} han respondido</p>
  </div>
{:else if state.phase === 'resultados' && pregunta}
  <div class="card">
    <h2>Resultados</h2>
    <p>Respuesta correcta: <strong style="color:var(--success)">{String.fromCharCode(65+correcta)}. {pregunta.opciones[correcta]}</strong></p>
    <ul>
      {#each Object.entries(state.respuestas) as [pid, ansRaw]}
        {@const ans = ansRaw as number}
        <li>{nombre(pid)}: {String.fromCharCode(65+ans)} {ans===correcta ? '✅ +100' : '❌'}</li>
      {/each}
      {#each peers.filter((p:any)=> state.respuestas[p.id]===undefined) as p}
        <li>{p.name}: sin respuesta —</li>
      {/each}
    </ul>
    <h3>Puntuaciones</h3>
    <ul>
      {#each Object.entries(state.puntuaciones).sort((a:any,b:any)=>b[1]-a[1]) as [pid, pts]}
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
      {#each Object.entries(state.puntuaciones).sort((a:any,b:any)=>b[1]-a[1]) as [pid, pts]}
        <li>{nombre(pid)} — {pts} pts</li>
      {/each}
    </ol>
    {#if room.isHost}
      <button on:click={restart}>Volver al lobby</button>
    {/if}
  </div>
{/if}

<style>
  .config {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.8rem;
    margin: 1rem 0;
  }
  label { display: grid; gap: 0.35rem; color: var(--muted); }
  select {
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--muted);
    padding: 0.5rem 0.8rem;
    border-radius: 6px;
  }
</style>
