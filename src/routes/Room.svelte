<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { roomStore, initRoom } from '../lib/stores/roomStore'
  import { gameStore } from '../lib/stores/gameStore'
  import { assignName, sanitizeName } from '../lib/utils/names'
  import { joinTrystero } from '../lib/net/trysteroAdapter'
  import { SyncNode } from '../lib/net/syncEngine'
  import type { SyncEvent } from '../lib/net/syncEngine'
  import { DEFAULT_GAME_ID, getGameModule } from '../lib/game/registry'
  import PlayerList from '../components/PlayerList.svelte'
  import ShareLink from '../components/ShareLink.svelte'
  import NameInput from '../components/NameInput.svelte'
  import Game from './Game.svelte'

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
    }
  }

  function startSecondTick(){
    if (secondInt) clearInterval(secondInt)
    // Pulso genérico de 1 s: el nodo decide (tick de juego si host,
    // heartbeat cada 2 s, reintento de sync si invitado sin sincronizar).
    secondInt = setInterval(()=>{
      node?.tickSecond()
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
    // nombre inicial: del query o Jugador N (se asignará tras ver peers)
    let nameToUse = initialName && sanitizeName(initialName) ? sanitizeName(initialName)! : ''
    // suscribirse a stores (sin sincronizar salaId: es fijo durante la vida de Room)
    unsubRoom = roomStore.subscribe(v=>{
      peers = v.peers; hostId = v.hostId; isHost = v.isHost; selfId = v.selfId; joinOrder = v.joinOrder
    })
    unsubGame = gameStore.subscribe(v=> gameState = v)

    // iniciar room (los stores alimentan a la UI; el protocolo vive en SyncNode)
    if (isHostParam) {
      if (!nameToUse) nameToUse = assignName(1)
      selfId = initRoom(freshSalaId, nameToUse, true)
      // init game
      const initPeers = [{id: selfId, name: nameToUse}] as any
      const game = getGameModule(juegoId)
      const initState = game
        ? game.createInitialState(initPeers, initialSegundos !== undefined ? { segundos: initialSegundos } : {})
        : { phase: 'lobby', version: 0, gameId: juegoId }
      gameStore.set(initState); gameState = initState
    } else {
      // guest: asignaremos nombre tras conectar, provisional
      if (!nameToUse) {
        // se asignará al recibir peers, por ahora Jugador ?
        nameToUse = assignName(2)
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
    trystero.get((msg:any, peerId:string)=> node?.receive(msg, peerId))

    trystero.onPeerJoin((id:string)=> node?.peerJoined(id))

    trystero.onPeerLeave((transportPeerId:string)=> node?.peerLeft(transportPeerId))

    // pulso de 1 s para el nodo (tick de juego, heartbeat, reintento de sync)
    startSecondTick()

    // el invitado pide estado al entrar; si tarda, el nodo reintenta solo
    node?.start()

    return ()=>{
      if (trystero) trystero.leave()
    }
  })

  onDestroy(()=>{
    if (unsubRoom) unsubRoom()
    if (unsubGame) unsubGame()
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
</script>

<div class="container">
  {#if toast}<div style="background:var(--success);color:var(--bg);padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">{toast}</div>{/if}
  {#if salaFull}<div style="background:var(--error);color:white;padding:0.6rem 1rem;border-radius:8px;margin:1rem 0">Sala llena (20 jugadores)</div>{/if}

  {#if gameState.phase === 'lobby'}
    <!-- ============ LOBBY ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
      <h2>Sala <code>{salaId}</code> {#if isHost}<span style="background:var(--accent);color:var(--bg);padding:2px 6px;border-radius:4px;font-size:0.7rem">Anfitrión</span>{/if}</h2>
      <button on:click={salir} style="background:var(--muted)">Salir</button>
    </div>

    <ShareLink {salaId} {juegoId} />
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
