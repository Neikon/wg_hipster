<script lang="ts">
  import { gameStore } from '../../stores/gameStore'
  import { roomStore } from '../../stores/roomStore'
  import { DEFAULT_CONFIG } from './engine'
  import { LISTAS, buscarEnItunes, prepararPartida, prepararPartidaBusqueda } from './listas'
  import type { ResultadoBusqueda, TipoBusqueda } from './listas'
  import type { HipsterState, HipsterTrack, ModoJuego } from './types'

  export let onAction: (a:any)=>void = ()=>{}

  const BUSCAR_ID = '__buscar__'

  let state: HipsterState
  let room: any
  let segundos = DEFAULT_CONFIG.segundos
  let listaId = DEFAULT_CONFIG.listaId
  let numRondas = DEFAULT_CONFIG.numRondas
  let modo: ModoJuego = DEFAULT_CONFIG.modo
  let anioEscrito: number | null = null
  let cargando = false
  let cargaError = ''
  let tracks: HipsterTrack[] | null = null
  let pool: HipsterTrack[] | null = null
  let descartados = 0
  // Búsqueda libre del host
  let textoBusq = ''
  let filtroTipos: TipoBusqueda[] = ['album', 'artista', 'lista']
  let buscando = false
  let busqError = ''
  let resultados: ResultadoBusqueda[] = []
  let seleccion: ResultadoBusqueda | null = null
  $: state = $gameStore as HipsterState
  $: room = $roomStore
  $: if (state.phase === 'lobby' && state.config) {
    segundos = state.config.segundos
    listaId = state.config.listaId
    numRondas = state.config.numRondas
    modo = state.config.modo
  }
  $: claveSel = seleccion ? `${seleccion.tipo}:${seleccion.id}` : ''
  // Si el host cambia de lista, modo, rondas o selección, hay que volver a cargar.
  $: if (tracks && (listaId !== cargadaPara?.listaId || numRondas !== cargadaPara?.numRondas || modo !== cargadaPara?.modo || claveSel !== (cargadaPara?.busq ?? ''))) {
    tracks = null
    pool = null
    descartados = 0
  }
  // Al cambiar de ronda se limpia el campo del año.
  let ultimaRondaVista = -1
  $: if (state.phase === 'pregunta' && state.ronda !== ultimaRondaVista) {
    ultimaRondaVista = state.ronda
    anioEscrito = null
  }
  let cargadaPara: { listaId: string; numRondas: number; busq: string; modo: ModoJuego } | null = null

  async function cargar(){
    cargando = true
    cargaError = ''
    tracks = null
    pool = null
    try {
      const conAnio = modo === 'anio'
      const r = listaId === BUSCAR_ID && seleccion
        ? await prepararPartidaBusqueda(seleccion, numRondas, 'ES', { requireAnio: conAnio })
        : await prepararPartida(listaId, numRondas, { requireAnio: conAnio })
      tracks = r.tracks
      pool = r.pool
      descartados = r.descartados
      cargadaPara = { listaId, numRondas, busq: claveSel, modo }
    } catch (e) {
      cargaError = e instanceof Error ? e.message : 'No se pudo cargar la lista'
    } finally {
      cargando = false
    }
  }

  async function buscar(){
    if (textoBusq.trim().length < 2 || buscando || filtroTipos.length === 0) return
    buscando = true
    busqError = ''
    resultados = []
    try {
      resultados = await buscarEnItunes(textoBusq, filtroTipos)
      if (resultados.length === 0) busqError = 'Sin resultados, prueba con otro texto'
    } catch (e) {
      busqError = e instanceof Error ? e.message : 'No se pudo buscar'
    } finally {
      buscando = false
    }
  }

  function elegir(r: ResultadoBusqueda){
    seleccion = r
    tracks = null
    pool = null
    descartados = 0
    void cargar()
  }

  function answer(opcion:number){
    if (state.respuestas[room.selfId] !== undefined) return
    onAction({ t:'answer', opcion })
  }
  function answerAnio(){
    if (state.respuestas[room.selfId] !== undefined) return
    if (anioEscrito === null || !Number.isInteger(anioEscrito)) return
    onAction({ t:'answer', opcion: anioEscrito })
  }
  function start(){
    if (!tracks || !pool) return
    onAction({ t:'startGame', juegoId:'hipster', config: { segundos, listaId, numRondas, modo }, tracks, pool })
  }
  function next(){ onAction({ t:'next' }) }
  function restart(){ onAction({ t:'restart' }) }
  $: peers = room.peers
  function nombre(pid:string){ return peers.find((p:any)=>p.id===pid)?.name || pid.slice(0,4) }
</script>

{#if state.phase === 'lobby'}
  <div class="card">
    <h2>🎵 Hipster musical</h2>
    <p class="muted">Escucha el clip y adivina la canción.</p>
    {#if room.isHost}
      <div style="display:grid;gap:0.8rem;margin:1rem 0;max-width:320px;text-align:left">
        <label style="display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
          Lista
          <select bind:value={listaId} aria-label="Lista de canciones">
            {#each LISTAS as l}
              <option value={l.id}>{l.nombre}</option>
            {/each}
            <option value={BUSCAR_ID}>🔍 Buscar mi lista…</option>
          </select>
        </label>
        {#if listaId === BUSCAR_ID}
          <div style="display:grid;gap:0.5rem">
            <fieldset style="border:0;margin:0;padding:0;display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
              <legend style="padding:0">Buscar por</legend>
              <span style="display:flex;gap:0.6rem;flex-wrap:wrap">
                {#each [['album', 'Álbumes'], ['artista', 'Artistas'], ['lista', 'Listas']] as [v, etiqueta]}
                  {@const val = v as TipoBusqueda}
                  <label style="display:flex;gap:0.3rem;align-items:center;color:var(--fg);font-size:0.85rem">
                    <input
                      type="checkbox"
                      checked={filtroTipos.includes(val)}
                      on:change={(e)=>{
                        const on = (e.target as HTMLInputElement).checked
                        filtroTipos = on ? [...filtroTipos, val] : filtroTipos.filter((t)=>t!==val)
                      }}
                    />
                    {etiqueta}
                  </label>
                {/each}
              </span>
            </fieldset>
            <label style="display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
              Buscar álbum, artista o lista
              <span style="display:flex;gap:0.4rem">
                <input
                  placeholder="p. ej. top 80s, Queen…"
                  bind:value={textoBusq}
                  on:keydown={(e)=>{ if (e.key === 'Enter') void buscar() }}
                  aria-label="Texto a buscar"
                  style="flex:1;min-width:0"
                />
                <button on:click={()=>void buscar()} disabled={buscando} style="background:var(--muted)">🔍</button>
              </span>
            </label>
            {#if buscando}<p class="muted">Buscando…</p>{/if}
            {#if busqError}<p style="color:var(--error)">{busqError}</p>{/if}
            {#if resultados.length}
              <ul style="list-style:none;margin:0;padding:0;display:grid;gap:0.4rem;max-height:220px;overflow:auto">
                {#each resultados as r}
                  <li>
                    <button
                      on:click={()=>elegir(r)}
                      style="display:flex;gap:0.6rem;align-items:center;width:100%;text-align:left;background:{seleccion?.id===r.id && seleccion?.tipo===r.tipo ? 'var(--success)' : 'var(--card)'};border:1px solid var(--muted)"
                    >
                      {#if r.artworkUrl}<img src={r.artworkUrl} alt="" width="40" height="40" style="border-radius:4px" />{/if}
                      <span><strong>{r.nombre}</strong><br /><small class="muted">{r.tipo === 'album' ? 'Álbum' : r.tipo === 'artista' ? 'Artista' : 'Lista'} · {r.subtitulo}</small></span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
        <label style="display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
          Modo de juego
          <select bind:value={modo} aria-label="Modo de juego">
            <option value="titulo">Adivina la canción</option>
            <option value="anio">Adivina el año (±5)</option>
          </select>
        </label>
        <label style="display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
          Rondas
          <select bind:value={numRondas} aria-label="Número de rondas">
            <option value={5}>5 rondas</option>
            <option value={10}>10 rondas</option>
            <option value={20}>20 rondas</option>
          </select>
        </label>
        <label style="display:grid;gap:0.35rem;color:var(--muted);font-size:0.9rem">
          Segundos por ronda
          <input type="number" min="5" max="300" bind:value={segundos} />
        </label>
      </div>
      {#if tracks}
        <p class="muted">Lista ✓ {tracks.length} rondas con audio{#if descartados} ({descartados} sin audio descartados){/if}</p>
      {:else if cargaError}
        <p style="color:var(--error)">{cargaError}</p>
      {/if}
      {#if cargando}
        <button disabled>Cargando música…</button>
      {:else if tracks}
        <button on:click={start}>Empezar hipster ({tracks.length} rondas)</button>
        <button on:click={cargar} style="background:var(--muted)">Recargar lista</button>
      {:else if listaId === BUSCAR_ID && !seleccion}
        <p class="muted">Busca y elige un álbum, un artista o una lista para jugar.</p>
      {:else}
        <button on:click={cargar}>Cargar lista</button>
      {/if}
    {:else}
      <p class="muted">El anfitrión está preparando la música…</p>
    {/if}
  </div>
{:else if state.phase === 'pregunta'}
  <div class="card">
    <div style="display:flex;justify-content:space-between"><strong>Ronda {state.ronda+1}/{state.tracks.length} · {state.config.modo === 'anio' ? '¿De qué año es?' : '¿Qué canción es?'}</strong><span>⏱ {state.timer}s</span></div>
    <audio controls src={state.clipUrl} style="width:100%;margin-top:1rem" aria-label="Clip musical"></audio>
    {#if state.config.modo === 'anio'}
      {#if state.respuestas[room.selfId] !== undefined}
        <p style="margin-top:1rem">Tu respuesta: <strong>{state.respuestas[room.selfId]}</strong> ✓</p>
      {:else}
        <div style="display:flex;gap:0.5rem;margin-top:1rem">
          <input
            type="number" min="1900" max="2100" placeholder="p. ej. 1985"
            bind:value={anioEscrito} aria-label="Año de la canción" style="flex:1;min-width:0"
            on:keydown={(e)=>{ if (e.key === 'Enter') answerAnio() }}
          />
          <button on:click={answerAnio}>Responder</button>
        </div>
        <p class="muted" style="margin-top:0.5rem">Vale cualquier año a ±5 del correcto.</p>
      {/if}
    {:else}
      <div style="display:grid;gap:0.6rem;margin-top:1rem">
        {#each state.opciones as op, idx}
          <button
            on:click={()=>answer(idx)}
            disabled={state.respuestas[room.selfId] !== undefined}
            style="text-align:left;border:1px solid var(--muted)"
          >{String.fromCharCode(65+idx)}. {op} {state.respuestas[room.selfId]===idx ? '✓' : ''}</button>
        {/each}
      </div>
    {/if}
    <p class="muted" style="margin-top:0.8rem">{Object.keys(state.respuestas).length}/{peers.length} han respondido</p>
  </div>
{:else if state.phase === 'resultados'}
  <div class="card">
    <h2>Resultados</h2>
    {#if state.config.modo === 'anio'}
      <p>Año correcto: <strong style="color:var(--success)">{state.respuestaCorrecta}</strong></p>
    {:else}
      <p>Correcta: <strong style="color:var(--success)">{state.opciones[state.respuestaCorrecta]}</strong></p>
    {/if}
    <ul>
      {#each Object.entries(state.respuestas) as [pid, ansRaw]}
        {@const ans = ansRaw as number}
        {#if state.config.modo === 'anio'}
          {@const dif = Math.abs(ans - (state.respuestaCorrecta as number))}
          <li>{nombre(pid)}: {ans} {dif <= 5 ? `✅ +100 (a ${dif})` : `❌ (a ${dif})`}</li>
        {:else}
          <li>{nombre(pid)}: {String.fromCharCode(65+ans)} {ans===state.respuestaCorrecta ? '✅ +100' : '❌'}</li>
        {/if}
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
