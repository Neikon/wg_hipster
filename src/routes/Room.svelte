<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { roomStore, initRoom } from '../lib/stores/roomStore'
  import { gameStore } from '../lib/stores/gameStore'
  import { randomName, sanitizeName } from '../lib/utils/names'
  import { joinTrystero, relayStatus } from '../lib/net/trysteroAdapter'
  import { SyncNode } from '../lib/net/syncEngine'
  import type { SyncEvent } from '../lib/net/syncEngine'
  import { DEFAULT_GAME_ID, getGameModule } from '../lib/game/registry'
  import PlayerList from '../components/PlayerList.svelte'
  import ShareLink from '../components/ShareLink.svelte'
  import NameInput from '../components/NameInput.svelte'
  import ThemeToggle from '../components/ThemeToggle.svelte'
  import Game from './Game.svelte'
  import { tinteActual } from '../lib/game/hipster/colores'
  import type { Tinte } from '../lib/game/hipster/colores'
  import { mezclarHex, textoSobre } from '../lib/game/hipster/colores'

  function genId() { return Math.random().toString(36).slice(2, 9) }

  let salaId = ''
  let isHostParam = false
  let initialName = ''
  let initialSegundos: number | undefined = undefined
  // El campo juegoId se mantiene en el protocolo para robustez entre versiones.
  let juegoId = DEFAULT_GAME_ID
  let trystero: any = null
  let node: SyncNode | null = null
  let unsubRoom: any
  let unsubGame: any
  let joinOrder: string[] = []
  let selfId = ''
  let hostId = ''
  let isHost = false
  let peers: any[] = []
  let gameState: any = { phase:'lobby', version:0, gameId: DEFAULT_GAME_ID }
  let salaFull = false
  let toast = ''
  let secondInt: any = null
  // Conexión: el invitado muestra "Conectando" hasta su primer sync.
  let synced = false
  let joinedAt = 0
  let rejoining = false
  const REJOIN_MS = 12000
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
      const st = relayStatus()
      relaysTotal = st.length
      relaysAbiertos = st.filter((s)=>s.open).length
    } catch { /* sin red: se reintenta en el siguiente tick */ }
  }

  function parseHash(){
    const hash = location.hash // #/sala/abcd12?host=1&name=...
    const m = hash.match(/#\/sala\/([a-z0-9]{6})/)
    salaId = m ? m[1] : ''
    const q = new URLSearchParams(hash.split('?')[1] || '')
    isHostParam = q.get('host') === '1'
    initialName = q.get('name') ? decodeURIComponent(q.get('name')!) : ''
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
      roomStore.update(v=>({...v, peers, joinOrder, hostId, isHost, selfName: e.selfName}))
    } else if (e.t === 'game') {
      gameState = e.state
      if (e.state?.gameId && e.state.gameId !== juegoId) juegoId = e.state.gameId
      gameStore.set(gameState)
    } else if (e.t === 'toast') {
      showToast(e.msg)
    } else if (e.t === 'salaFull') {
      salaFull = true
    } else if (e.t === 'synced') {
      synced = true
      rejoining = false
      try { sessionStorage.removeItem(`wg_hipster:reloads:${salaId}`) } catch {}
    }
  }

  function wireTransport(){
    if (!trystero || !node) return
    trystero.get((msg:any, peerId:string)=> node?.receive(msg, peerId))
    trystero.onPeerJoin((id:string)=> node?.peerJoined(id))
    trystero.onPeerLeave((transportPeerId:string)=> node?.peerLeft(transportPeerId))
  }

  /** Reconexión: salir y volver a entrar para re-anunciarse en los trackers. */
  function reconectar(motivo: string){
    if (!node || rejoining) return
    rejoining = true
    showToast(motivo)
    try { trystero?.leave() } catch {}
    try {
      trystero = joinTrystero(salaId)
      wireTransport()
      node.start()
    } catch {
      showToast('Error conectando P2P')
    } finally {
      joinedAt = Date.now()
      setTimeout(()=>{ rejoining = false }, 3000)
    }
  }

  function startSecondTick(){
    if (secondInt) clearInterval(secondInt)
    // Pulso genérico de 1 s: el nodo decide (tick de juego si host,
    // heartbeat cada 2 s, reintento de sync si invitado sin sincronizar).
    secondInt = setInterval(()=>{
      node?.tickSecond()
      actualizarRelays()
      ahora = Date.now()
    }, 1000)
  }

  onMount(()=>{
    parseHash()
    if (!salaId) { location.hash = '#/'; return }
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

    // conectar Trystero
    try {
      trystero = joinTrystero(freshSalaId)
    } catch(e){
      console.error('Trystero error', e)
      showToast('Error conectando P2P')
      return
    }

    // nodo de protocolo: recibe mensajes, emite snapshots a los stores
    node = new SyncNode({
      salaId: freshSalaId,
      selfId,
      selfName: nameToUse,
      isHost: isHostParam,
      hostId: isHostParam ? selfId : '',
      juegoId,
      initialGameState: gameState,
      getGameModule: (id: string) => getGameModule(id),
      send: (msg: any) => trystero.send(msg),
      emit: onSyncEvent
    })
    {
      const snap = node.snapshot()
      peers = snap.peers; joinOrder = snap.joinOrder; hostId = snap.hostId; isHost = snap.isHost
      roomStore.update(v=>({...v, peers, joinOrder, hostId, isHost}))
    }

    // manejar mensajes
    wireTransport()

    // pulso de 1 s para el nodo (tick de juego, heartbeat, reintento de sync)
    startSecondTick()

    // el invitado pide estado al entrar; si tarda, el nodo reintenta solo
    node?.start()
    joinedAt = Date.now()
    actualizarRelays()

    // watchdog: invitado sin sincronizar >12 s → re-anunciarse en trackers
    // (la reconexión crea sockets nuevos y resetea el backoff de Trystero).
    // Si además no hay ningún tracker abierto, no se esperan los 12 s.
    // Último recurso: recarga dura topada. El pool de ofertas de Trystero es
    // global a la página y no se limpia al reconectar en caliente: solo una
    // recarga (contexto JS nuevo) lo sanea. Topado para no ciclar si la sala
    // ya no existe; al sincronizar se resetea el contador.
    const HARD_RELOAD_MS = 30000
    const MAX_HARD_RELOADS = 2
    const reloadKey = `wg_hipster:reloads:${freshSalaId}`
    const reloadsHechas = () => {
      try { return parseInt(sessionStorage.getItem(reloadKey) || '0', 10) || 0 } catch { return MAX_HARD_RELOADS }
    }
    const watch = setInterval(()=>{
      if (!node) return
      const snap = node.snapshot()
      if (!snap.isHost && !snap.syncedOnce && Date.now() - joinedAt > REJOIN_MS) {
        reconectar('Conexión lenta, reintentando…')
      } else if (!snap.isHost && !snap.syncedOnce && relaysTotal > 0 && relaysAbiertos === 0 && Date.now() - joinedAt > 5000) {
        reconectar('Sin señalización, reintentando…')
      } else if (!snap.isHost && !snap.syncedOnce && Date.now() - joinedAt > HARD_RELOAD_MS && reloadsHechas() < MAX_HARD_RELOADS) {
        try { sessionStorage.setItem(reloadKey, String(reloadsHechas() + 1)) } catch {}
        location.reload()
      }
    }, 2000)

    return ()=>{
      clearInterval(watch)
      if (trystero) trystero.leave()
    }
  })

  onDestroy(()=>{
    if (unsubRoom) unsubRoom()
    if (unsubGame) unsubGame()
    unsubTinte()
    tinteActual.set(null)
    if (secondInt) clearInterval(secondInt)
    if (trystero) trystero.leave()
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
    if (trystero) trystero.leave()
    location.hash = '#/'
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
  {#if !isHost && !synced}
    <div style="background:var(--accent);color:var(--bg);padding:0.6rem 1rem;border-radius:8px;margin:1rem 0;display:flex;gap:0.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <span>Conectando con la sala…{rejoining ? ' reintentando' : ''}</span>
      <button on:click={()=>reconectar('Reintentando conexión…')} disabled={rejoining} style="background:var(--bg);color:var(--fg);padding:0.3rem 0.7rem;font-size:0.85rem">Reintentar</button>
    </div>
  {/if}

  {#if gameState.phase === 'lobby'}
    <!-- ============ LOBBY ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <h2>Sala <code>{salaId}</code> {#if isHost}<span style="background:var(--accent);color:#fff;padding:2px 6px;border-radius:4px;font-size:0.7rem">Anfitrión</span>{/if}</h2>
      <span style="display:flex;gap:0.5rem"><ThemeToggle /><button on:click={salir} style="background:var(--muted)">Salir</button></span>
    </div>

    <ShareLink {salaId} {juegoId} />

    {#if relaysTotal > 0}
      <p class="muted" style="font-size:0.8rem;margin:0.4rem 0 0">Señalización: {relaysAbiertos}/{relaysTotal} trackers</p>
    {/if}
    {#if isHost && relaysTotal > 0 && relaysAbiertos === 0 && ahora - joinedAt > SIN_SENAL_MS}
      <div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:0.6rem 0;display:flex;gap:0.6rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <span>Sin conexión con los trackers: ningún jugador nuevo puede entrar. Recarga la página para re-anunciar la sala.</span>
        <button on:click={()=>location.reload()} style="background:white;color:var(--error);padding:0.3rem 0.7rem;font-size:0.85rem">Recargar</button>
      </div>
    {/if}
  {:else}
    <!-- ============ JUEGO ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.8rem">
      <span class="muted" style="font-size:0.85rem"><code>{salaId}</code></span>
      <button on:click={salir} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Salir</button>
    </div>
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
      </div>
    {/if}
  </div>
</div>
