<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { roomStore, initRoom } from '../lib/stores/roomStore'
  import { gameStore } from '../lib/stores/gameStore'
  import { randomName, sanitizeName } from '../lib/utils/names'
  import { joinTrystero, relayStatus, transportSelfId, type TrysteroRoom } from '../lib/net/trysteroAdapter'
  import { readTurnServers, refreshTurnServers, turnApiUrl, guardarTurnApi } from '../lib/net/turn'
  import { signalingStrategy, guardarEstrategia, supaConf, guardarSupa, hashQuery, signalingParams, guestRecovery, MAX_HARD_RELOADS, type Estrategia, type SupaConf } from '../lib/net/signaling'
  import { debugLog, downloadText, installConsoleCapture, installBroadcastProbe, necesitaReanuncio } from '../lib/net/debug'
  import { diagnosticarRed } from '../lib/net/iceCheck'
  import { buildRtcConfig, trackerUrls } from '../lib/net/transport'
  import { SyncNode } from '../lib/net/syncEngine'
  import type { SyncEvent } from '../lib/net/syncEngine'
  import { DEFAULT_GAME_ID, getGameModule } from '../lib/game/registry'
  import PlayerList from '../components/PlayerList.svelte'
  import ShareLink from '../components/ShareLink.svelte'
  import NameInput from '../components/NameInput.svelte'
  import KoFi from '../components/KoFi.svelte'
  import ThemeToggle from '../components/ThemeToggle.svelte'
  import Game from './Game.svelte'
  import { tinteActual } from '../lib/game/hipster/colores'
  import type { Tinte } from '../lib/game/hipster/colores'
  import { mezclarHex, textoSobre } from '../lib/game/hipster/colores'

  let salaId = ''
  let isHostParam = false
  let initialName = ''
  let initialSegundos: number | undefined = undefined
  // El campo juegoId se mantiene en el protocolo para robustez entre versiones.
  let juegoId = DEFAULT_GAME_ID
  let trystero: TrysteroRoom | null = null
  let disposed = false
  let node: SyncNode | null = null
  let unsubRoom: any
  let unsubGame: any
  let joinOrder: string[] = []
  let selfId = ''
  let hostId = ''
  let hostTransportId = ''
  let isHost = false
  let peers: any[] = []
  let gameState: any = { phase:'lobby', version:0, gameId: DEFAULT_GAME_ID }
  let salaFull = false
  let toast = ''
  let secondInt: any = null
  let watch: any = null
  let estrategia: Estrategia = 'torrent'
  let supaActiva: SupaConf | null = null
  let supaUrlTxt = ''
  let supaKeyTxt = ''
  let supaMsg = ''
  function cambiarEstrategia(e: Estrategia, supa: SupaConf | null = null) {
    const q = hashQuery()
    q.delete('supaUrl')
    q.delete('supaKey')
    for (const [key, value] of signalingParams(e, supa)) q.set(key, value)
    guardarEstrategia(e)
    history.replaceState(null, '', `#/sala/${salaId}?${q}`)
    location.reload()
  }
  function guardarSupaUI() {
    if (guardarSupa(supaUrlTxt, supaKeyTxt)) {
      cambiarEstrategia('supabase', { url: supaUrlTxt, key: supaKeyTxt })
    } else {
      supaMsg = 'Introduce la URL HTTPS del proyecto y una clave publicable o anon.'
    }
  }
  let turnApiTxt = ''
  let turnMsg = ''
  let turnCount = 0
  function guardarTurn() {
    if (guardarTurnApi(turnApiTxt)) {
      turnMsg = 'URL guardada; obteniendo servidores…'
      refreshTurnServers()
        .then((list) => {
          turnCount = list.length > 0 ? list.length : readTurnServers().length
          turnMsg = turnCount > 0 ? `TURN activo (${turnCount} servidores). Recarga la sala para usarlo.` : 'Sin respuesta del endpoint; revisa la URL.'
        })
        .catch(() => {
          turnMsg = 'Sin respuesta del endpoint; revisa la URL.'
        })
    } else {
      turnMsg = 'La URL debe empezar por https://'
    }
  }
  // Conexión: el invitado muestra "Conectando" hasta su primer sync.
  // Depuración (?debug=1): registro exportable de red+protocolo.
  let debug = false
  let debugTexto = ''
  $: debugCount = debugTexto ? debugTexto.split('\n').length : 0
  let desinstalarConsola: (() => void) | null = null
  let desinstalarSonda: (() => void) | null = null
  let ocultoDesde: number | null = null
  let aVisibilidad: (() => void) | null = null
  let aOnline: (() => void) | null = null
  let aOffline: (() => void) | null = null
  function limpiarDebug(){
    try {
      if (aVisibilidad) document.removeEventListener('visibilitychange', aVisibilidad)
      if (aOnline) window.removeEventListener('online', aOnline)
      if (aOffline) window.removeEventListener('offline', aOffline)
    } catch { /* limpieza best-effort */ }
    try {
      desinstalarConsola?.()
      desinstalarSonda?.()
    } catch { /* limpieza best-effort */ }
    aVisibilidad = aOnline = aOffline = null
    desinstalarConsola = null
    desinstalarSonda = null
    ocultoDesde = null
    debugLog.disable()
  }
  let relaysPrev = new Map<string, boolean>()
  function uaCorta(): string {
    try { return navigator.userAgent } catch { return 'sin-UA' }
  }
  function buildId(): string {
    try {
      return typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'sin-build'
    } catch {
      return 'sin-build'
    }
  }
  let synced = false
  let joinedAt = 0
  let esperandoDesde = 0
  let rejoining = false
  let recuperacionAgotada = false
  let connectionError = ''
  let configuracionInvalida = false
  // Señalización (trackers): X de Y sockets abiertos. Con 0 abiertos la sala
  // es fantasma —la malla de datos vive pero nadie nuevo puede entrar—.
  // El aviso de fantasma lleva gracia inicial: al cargar, los sockets tardan
  // unos segundos en abrir y un 0/4 fugaz sería un falso positivo.
  let relaysAbiertos = 0
  let relaysTotal = 0
  const SIN_SENAL_MS = 8000
  // Reloj reactivo (1 s) para que las condiciones con Date.now() se reevalúen
  // aunque los contadores no cambien.
  let ahora = Date.now()
  function actualizarRelays(){
    try {
      const st = relayStatus(trackerUrls())
      relaysTotal = st.length
      relaysAbiertos = st.filter((s)=>s.open).length
      for (const s of st) {
        const antes = relaysPrev.get(s.url)
        if (antes !== undefined && antes !== s.open) {
          debugLog.log('red', `tracker ${s.open ? 'abierto' : 'CERRADO'}: ${s.url}`)
        }
        relaysPrev.set(s.url, s.open)
      }
    } catch { /* sin red: se reintenta en el siguiente tick */ }
  }

  function parseHash(){
    const hash = location.hash // #/sala/abcd12?host=1&name=...
    const m = hash.match(/#\/sala\/([a-z0-9]{6})/)
    salaId = m ? m[1] : ''
    const q = hashQuery(hash)
    isHostParam = q.get('host') === '1'
    initialName = q.get('name') ?? ''
    hostTransportId = isHostParam ? transportSelfId : q.get('anfitrion') ?? ''
    debug = q.get('debug') === '1'
    const j = q.get('juego')
    if (j && getGameModule(j)) juegoId = j
    const seg = parseInt(q.get('segundos') || '', 10)
    initialSegundos = Number.isFinite(seg) ? seg : undefined
  }

  function showToast(msg:string){
    toast=msg; setTimeout(()=>toast='', 4000)
  }

  function onSyncEvent(e: SyncEvent){
    if (e.t === 'room') {
      peers = e.peers; joinOrder = e.joinOrder; hostId = e.hostId; isHost = e.isHost
      hostTransportId = e.hostTransportId
      roomStore.update(v=>({...v, peers, joinOrder, hostId, isHost, selfName: e.selfName}))
    } else if (e.t === 'game') {
      gameState = e.state
      if (e.state?.gameId && e.state.gameId !== juegoId) juegoId = e.state.gameId
      gameStore.set(gameState)
    } else if (e.t === 'toast') {
      showToast(e.msg)
    } else if (e.t === 'salaFull') {
      salaFull = true
      debugLog.log('sala', 'sala llena')
    } else if (e.t === 'synced') {
      synced = true
      salaFull = false
      connectionError = ''
      try {
        const n = node?.snapshot().peers.length ?? peers.length
        debugLog.log('sala', `sincronizado (peers=${n})`)
      } catch { /* log best-effort */ }
      try { sessionStorage.removeItem(`wg_hipster:reloads:${salaId}`) } catch {}
    }
  }

  function wireTransport(room: TrysteroRoom) {
    room.get((msg: any, peerId: string) => {
      if (trystero !== room) return
      if (debug) debugLog.log('proto', `← ${msg?.t ?? '?'} de ${peerId} (${JSON.stringify(msg ?? null).length}B)`)
      node?.receive(msg, peerId)
    })
    room.onPeerJoin((id) => {
      if (trystero !== room) return
      debugLog.log('red', `peer transporte unido: ${id}`)
      node?.peerJoined(id)
    })
    room.onPeerLeave((id) => {
      if (trystero !== room) return
      debugLog.log('red', `peer transporte fuera: ${id}`)
      node?.peerLeft(id)
    })
  }

  /** Sale de la conexión anterior y vuelve a anunciarse con el mismo nodo. */
  async function reconectar(motivo = '') {
    if (!node || rejoining || disposed || configuracionInvalida) return
    rejoining = true
    if (motivo) {
      showToast(motivo)
      debugLog.log('red', `reconexión: ${motivo}`)
    }
    const anterior = trystero
    trystero = null
    try {
      await anterior?.leave()
      if (disposed) return
      const cache = readTurnServers()
      const refresh = refreshTurnServers()
      const turn = cache.length ? cache : await refresh
      if (disposed) return
      const room = await joinTrystero(salaId, turn, estrategia, supaActiva)
      if (disposed) {
        await room.leave()
        return
      }
      trystero = room
      if (!recuperacionAgotada) connectionError = ''
      wireTransport(room)
      node.start()
    } catch (e) {
      if (disposed) return
      if (!recuperacionAgotada) {
        connectionError = 'No se pudo abrir la conexión P2P. Revisa la red y vuelve a intentarlo.'
      }
      debugLog.log('red', `No se pudo abrir la conexión: ${String(e)}`)
    } finally {
      joinedAt = Date.now()
      rejoining = false
      actualizarRelays()
    }
  }

  function reintentarManual() {
    if (recuperacionAgotada) {
      recuperacionAgotada = false
      esperandoDesde = Date.now()
      try { sessionStorage.removeItem(`wg_hipster:reloads:${salaId}`) } catch {}
    }
    void reconectar('Reintentando conexión…')
  }

  function startWatch() {
    const reloadKey = `wg_hipster:reloads:${salaId}`
    watch = setInterval(() => {
      if (isHost || synced || salaFull || recuperacionAgotada || configuracionInvalida) return
      let reloads = MAX_HARD_RELOADS
      try { reloads = Number(sessionStorage.getItem(reloadKey)) || 0 } catch {}
      const now = Date.now()
      const sinTrackers = estrategia === 'torrent' && relaysAbiertos === 0
      const tarea = guestRecovery(now - esperandoDesde, now - joinedAt, reloads, sinTrackers)
      if (tarea === 'reload') {
        try {
          sessionStorage.setItem(reloadKey, String(reloads + 1))
          debugLog.log('sys', 'recarga dura por falta de sync')
          location.reload()
          return
        } catch { /* con storage bloqueado, termina aquí sin recargar */ }
      }
      if (tarea === 'reload' || tarea === 'failed') {
        recuperacionAgotada = true
        connectionError = 'No se pudo entrar en la sala. Pide al anfitrión que vuelva a compartir el enlace.'
      } else if (tarea === 'retry') {
        void reconectar(sinTrackers ? 'Sin señalización, reintentando…' : 'Conexión lenta, reintentando…')
      }
    }, 2000)
  }

  function startSecondTick(){
    if (secondInt) clearInterval(secondInt)
    // Pulso genérico de 1 s: el nodo decide (tick de juego si host,
    // heartbeat cada 2 s, reintento de sync si invitado sin sincronizar).
    secondInt = setInterval(()=>{
      node?.tickSecond()
      actualizarRelays()
      ahora = Date.now()
      if (debug) debugTexto = debugLog.tail(80)
    }, 1000)
  }

  onMount(()=>{
    parseHash()
    if (!salaId) { location.hash = '#/'; return }
    estrategia = signalingStrategy()
    supaActiva = estrategia === 'supabase' ? supaConf() : null
    configuracionInvalida = estrategia === 'supabase' && !supaActiva
    if (configuracionInvalida) connectionError = 'Falta una configuración válida de Supabase para esta sala.'
    if (debug) {
      let recargas = 0
      try { recargas = parseInt(sessionStorage.getItem(`wg_hipster:reloads:${salaId}`) || '0', 10) || 0 } catch { /* sin storage */ }
      debugLog.enable({ sala: salaId, rol: isHostParam ? 'host' : 'invitado', ua: uaCorta(), build: buildId(), recargasDuras: String(recargas) })
      desinstalarConsola = installConsoleCapture()
      desinstalarSonda = installBroadcastProbe()
      // En móvil la app en segundo plano congela timers/sockets: si el host
      // bloquea el móvil, sus anuncios mueren y la sala se vacía. Registrarlo
      // y, al volver tras >10 s, re-anunciarse (invitado siempre; host solo
      // si está solo para no provocar migración con invitados dentro).
      aVisibilidad = () => {
        try {
          debugLog.log('sys', `visibilidad: ${document.visibilityState}`)
          if (document.visibilityState === 'hidden') {
            ocultoDesde = Date.now()
          } else if (ocultoDesde !== null) {
            const ms = Date.now() - ocultoDesde
            ocultoDesde = null
            if (!recuperacionAgotada && necesitaReanuncio(ms, isHost, peers.length)) {
              debugLog.log('sys', `vuelta de segundo plano tras ${Math.round(ms / 1000)}s: re-anuncio`)
              void reconectar('Conexión pausada, reintentando…')
            }
          }
        } catch { /* log best-effort */ }
      }
      aOnline = () => debugLog.log('red', 'red: online')
      aOffline = () => debugLog.log('red', 'red: OFFLINE')
      try {
        document.addEventListener('visibilitychange', aVisibilidad)
        window.addEventListener('online', aOnline)
        window.addEventListener('offline', aOffline)
        debugLog.log('sys', `visibilidad inicial: ${document.visibilityState}`)
      } catch { /* listeners best-effort */ }
      // Chequeo automático al entrar en debug: el log trae siempre el veredicto.
      void probarRed()
    }
    turnApiTxt = turnApiUrl() ?? ''
    turnCount = readTurnServers().length
    const supaGuardada = supaConf()
    supaUrlTxt = supaGuardada?.url ?? ''
    supaKeyTxt = supaGuardada?.key ?? ''
    // el id recién parseado manda: la suscripción al store dispara primero con
    // datos de una sala anterior y no debe pisarlo (ver roadmap punto 4)
    const freshSalaId = salaId
    // estado limpio al (re)entrar en una sala: el store puede traer datos de otra anterior
    gameStore.set({ phase: 'lobby', version: 0, gameId: juegoId })
    // nombre inicial: del query o aleatorio Animal+Adjetivo
    let nameToUse = initialName && sanitizeName(initialName) ? sanitizeName(initialName)! : ''
    // suscribirse a stores (sin sincronizar salaId: es fijo durante la vida de Room)
    unsubRoom = roomStore.subscribe(v=>{
      peers = v.peers; hostId = v.hostId; isHost = v.isHost; selfId = v.selfId; joinOrder = v.joinOrder
    })
    unsubGame = gameStore.subscribe(v=> gameState = v)

    // iniciar room (los stores alimentan a la UI; el protocolo vive en SyncNode)
    if (isHostParam) {
      if (!nameToUse) nameToUse = randomName()
      selfId = initRoom(freshSalaId, nameToUse, true)
      // init game
      const initPeers = [{id: selfId, name: nameToUse}] as any
      const game = getGameModule(juegoId)
      const initState = game
        ? game.createInitialState(initPeers, initialSegundos !== undefined ? { segundos: initialSegundos } : {})
        : { phase: 'lobby', version: 0, gameId: juegoId }
      gameStore.set(initState); gameState = initState
    } else {
      // guest: nombre aleatorio evitando los peers ya visibles
      if (!nameToUse) {
        nameToUse = randomName(peers.map((p: any) => p.name))
      }
      selfId = initRoom(freshSalaId, nameToUse, false)
      gameStore.set({ phase: 'lobby', version: 0, gameId: juegoId })
      gameState = { phase: 'lobby', version: 0, gameId: juegoId }
    }

    node = new SyncNode({
      salaId: freshSalaId,
      selfId,
      selfTransportId: transportSelfId,
      selfName: nameToUse,
      isHost: isHostParam,
      hostId: isHostParam ? selfId : '',
      hostTransportId,
      juegoId,
      initialGameState: gameState,
      getGameModule,
      send: (msg, transportPeerId) => {
        if (debug) debugLog.log('proto', `→ ${msg?.t ?? '?'} (${JSON.stringify(msg ?? null).length}B)`)
        trystero?.send(msg, transportPeerId)
      },
      emit: onSyncEvent
    })
    const snap = node.snapshot()
    peers = snap.peers; joinOrder = snap.joinOrder; hostId = snap.hostId; isHost = snap.isHost
    roomStore.update(v=>({...v, peers, joinOrder, hostId, isHost}))

    joinedAt = esperandoDesde = Date.now()
    startSecondTick()
    startWatch()
    void reconectar()
  })

  onDestroy(()=>{
    disposed = true
    limpiarDebug()
    if (unsubRoom) unsubRoom()
    if (unsubGame) unsubGame()
    unsubTinte()
    tinteActual.set(null)
    if (secondInt) clearInterval(secondInt)
    if (watch) clearInterval(watch)
    const room = trystero
    trystero = null
    void room?.leave().catch(() => {})
  })

  function onRename(e:CustomEvent){
    const newName = e.detail as string
    node?.rename(newName)
    showToast('Nombre cambiado a ' + newName)
  }

  function handleGameAction(a:any){
    node?.gameAction(a)
  }

  function salir(){
    location.hash = '#/'
  }

  function copiarLog(){
    const txt = debugLog.toText()
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(
          () => showToast('Log copiado'),
          () => showToast('No se pudo copiar')
        )
      } else {
        showToast('Portapapeles no disponible')
      }
    } catch {
      showToast('No se pudo copiar')
    }
  }

  function descargarLog(){
    const ok = downloadText(`wg_hipster-${salaId}.log`, debugLog.toText())
    showToast(ok ? 'Log descargado' : 'No se pudo descargar')
  }

  /** Chequeo activo de red: reúne candidatos ICE y vuelca el veredicto al log. */
  async function probarRed(){
    showToast('Probando red…')
    debugLog.log('sys', 'chequeo ICE iniciado')
    const v = await diagnosticarRed(buildRtcConfig(readTurnServers())).catch(() => null)
    if (!v) {
      showToast('Chequeo no disponible')
      return
    }
    debugLog.log('sys', `ICE host=[${v.host.join(',') || '—'}] srflx=[${v.srflx.join(',') || '—'}] relay=[${v.relay.join(',') || '—'}] => ${v.veredicto}`)
    showToast(
      v.veredicto === 'P2P_OK'
        ? 'Red OK para P2P'
        : v.veredicto === 'SOLO_TURN'
          ? 'P2P solo con TURN'
          : 'Red NO apta para P2P directo'
    )
  }

  /** Activa el modo debug recargando con &debug=1 (instrumenta desde el join).
   *  El router solo remonta por salaId, así que sin recarga no tendría efecto. */
  function activarDebug(){
    const h = location.hash
    if (/[?&]debug=1/.test(h)) return
    location.hash = h.includes('?') ? `${h}&debug=1` : `${h}?debug=1`
    location.reload()
  }

  let tinte: Tinte | null = null
  let tinteCard = ''
  let tinteTextoTarjeta = ''
  const unsubTinte = tinteActual.subscribe((t)=> {
    tinte = t
    // --tinte-card y su texto se calculan en JS (hex) para que funcionen
    // en cualquier navegador. OJO: el texto de las respuestas va contra la
    // tarjeta, NO contra el acento (cada superficie lleva el suyo).
    if (t) {
      const base = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#22262f'
      tinteCard = mezclarHex(t.fondo, base, 0.45)
      tinteTextoTarjeta = textoSobre(tinteCard)
    } else {
      tinteCard = ''
      tinteTextoTarjeta = ''
    }
  })
</script>

<div
  class="container sala"
  data-tinte={tinte ? '1' : '0'}
  style={tinte
    ? `--tinte-fondo:${tinte.fondo};--tinte-card:${tinteCard};--tinte-texto-tarjeta:${tinteTextoTarjeta};--accent:${tinte.acento};--accent-hover:${tinte.acento};--tinte-texto:${tinte.sobreAcento}`
    : ''}
>
  {#if toast}<div style="background:var(--success);color:var(--bg);padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">{toast}</div>{/if}
  {#if salaFull}<div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">Sala llena (20 jugadores)</div>{/if}
  {#if connectionError || (!isHost && !synced && !salaFull)}
    <div style="background:var(--accent);color:var(--bg);padding:0.6rem 1rem;border-radius:8px;margin:1rem 0;display:flex;gap:0.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <span role="status">{connectionError || 'Conectando con la sala…'}</span>
      {#if !configuracionInvalida}
        <button on:click={reintentarManual} disabled={rejoining} style="background:var(--bg);color:var(--fg);padding:0.3rem 0.7rem;font-size:0.85rem">Reintentar</button>
      {/if}
    </div>
  {/if}

  {#if gameState.phase === 'lobby'}
    <!-- ============ LOBBY ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <h2>Sala <code>{salaId}</code> {#if isHost}<span style="background:var(--accent);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem">Anfitrión</span>{/if}</h2>
      <span style="display:flex;gap:0.5rem"><ThemeToggle /><button on:click={salir} style="background:var(--muted)">Salir</button></span>
    </div>

    <ShareLink {salaId} {juegoId} {estrategia} supa={supaActiva} {hostTransportId} />

    {#if estrategia === 'torrent' && relaysTotal > 0}
      <p class="muted" style="font-size:0.8rem;margin:0.4rem 0 0">Señalización: {relaysAbiertos}/{relaysTotal} trackers</p>
    {:else if estrategia === 'supabase'}
      <p class="muted" style="font-size:0.8rem;margin:0.4rem 0 0">Señalización: Supabase</p>
    {/if}
    {#if !debug}
      <p style="margin:0.2rem 0 0"><button on:click={activarDebug} style="background:none;border:none;padding:0;margin:0;min-height:0;font-size:0.8rem;font-weight:400;color:var(--muted);text-decoration:underline;cursor:pointer">depurar</button></p>
    {/if}
    {#if isHost && estrategia === 'torrent' && !rejoining && relaysAbiertos === 0 && ahora - joinedAt > SIN_SENAL_MS}
      <div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:0.6rem 0;display:flex;gap:0.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <span>Sin conexión con los trackers: ningún jugador nuevo puede entrar. Recarga la página para re-anunciar la sala.</span>
        <button on:click={()=>location.reload()} style="background:white;color:var(--error);padding:0.3rem 0.7rem;font-size:0.85rem">Recargar</button>
      </div>
    {/if}
    <details style="margin-top:0.6rem;font-size:0.85rem">
      <summary class="muted" style="cursor:pointer">Datos móviles: TURN ({turnCount} activos)</summary>
      <p class="muted">Con datos, el UDP directo a veces no cruza y nadie entra aunque haya señalización. Pega tu URL de credenciales TURN (Metered, gratis) y se usará al entrar.</p>
      <div style="display:flex;gap:0.4rem">
        <input bind:value={turnApiTxt} placeholder="https://….metered.live/api/v1/turn/credentials?apiKey=…" aria-label="URL de credenciales TURN" style="flex:1;min-width:0" />
        <button on:click={guardarTurn} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Guardar</button>
      </div>
      {#if turnMsg}<p class="muted">{turnMsg}</p>{/if}
    </details>
    <details style="margin-top:0.6rem;font-size:0.85rem">
      <summary class="muted" style="cursor:pointer">Señalización: {estrategia === 'supabase' ? 'Supabase' : 'trackers'}</summary>
      <p class="muted">Los trackers públicos son la opción inicial. También puedes conectar un proyecto Supabase propio y compartir el enlace actualizado.</p>
      {#if estrategia !== 'torrent'}
        <button on:click={()=>cambiarEstrategia('torrent')} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Usar trackers</button>
      {/if}
      <div style="display:grid;gap:0.4rem;margin-top:0.4rem">
        <input bind:value={supaUrlTxt} placeholder="https://xxx.supabase.co" aria-label="URL del proyecto Supabase" style="width:100%" />
        <input bind:value={supaKeyTxt} placeholder="Clave publicable (sb_publishable_…)" aria-label="Clave publicable Supabase" style="width:100%" />
        <div><button on:click={guardarSupaUI} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Usar Supabase y recargar</button></div>
      </div>
      {#if supaMsg}<p class="muted">{supaMsg}</p>{/if}
    </details>
    {#if debug}
      <details style="margin-top:0.6rem;font-size:0.85rem">
        <summary class="muted" style="cursor:pointer">Registro de depuración ({debugCount} líneas)</summary>
        <div style="display:flex;gap:0.4rem;margin:0.4rem 0;flex-wrap:wrap">
          <button on:click={copiarLog} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Copiar</button>
          <button on:click={descargarLog} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Descargar</button>
          <button on:click={()=>void probarRed()} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Probar mi red</button>
        </div>
        <pre style="max-height:220px;overflow:auto;background:var(--bg);border:1px solid var(--muted);border-radius:8px;padding:0.5rem;font-size:0.75rem;white-space:pre-wrap;overflow-wrap:anywhere">{debugTexto}</pre>
      </details>
    {/if}
  {:else}
    <!-- ============ JUEGO ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.8rem">
      <span class="muted" style="font-size:0.85rem"><code>{salaId}</code></span>
      <button on:click={salir} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Salir</button>
    </div>
    {#if isHost && !isHostParam}
      <details>
        <summary>Compartir sala</summary>
        <ShareLink {salaId} {juegoId} {estrategia} supa={supaActiva} {hostTransportId} />
      </details>
    {/if}
  {/if}

  <!-- Una sola instancia de Game en ambas fases: va fuera de todo condicional
       para que Svelte no la destruya al cambiar de fase (perdería su estado
       local, p. ej. la lista cargada por el host). -->
  <div style="display:grid;gap:1rem;margin-top:1rem">
    <div>
      <Game {juegoId} onAction={handleGameAction} />
    </div>
    {#if gameState.phase === 'lobby'}
      <div>
        <h3>Jugadores ({peers.length}/20)</h3>
        <PlayerList peers={peers} hostId={hostId} />
        <div style="margin-top:1rem">
          <h4>Cambiar nombre</h4>
          <NameInput value={peers.find(p=>p.id===selfId)?.name || ''} on:save={onRename} />
        </div>
        <KoFi />
      </div>
    {/if}
  </div>
</div>
