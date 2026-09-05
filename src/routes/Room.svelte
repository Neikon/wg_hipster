<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { roomStore, initRoom } from '../lib/stores/roomStore'
  import { gameStore } from '../lib/stores/gameStore'
  import { assignName, sanitizeName } from '../lib/utils/names'
  import { electNewHost, isRoomFull } from '../lib/net/room'
  import { joinTrystero } from '../lib/net/trysteroAdapter'
  import { DEFAULT_GAME_ID, getGameModule } from '../lib/game/registry'
  import PlayerList from '../components/PlayerList.svelte'
  import ShareLink from '../components/ShareLink.svelte'
  import NameInput from '../components/NameInput.svelte'
  import Game from './Game.svelte'

  let salaId = ''
  let isHostParam = false
  let initialName = ''
  // Plantilla de un solo juego: juegoId es siempre el registrado por defecto.
  // El campo juegoId se mantiene en el protocolo para robustez entre versiones.
  let juegoId = DEFAULT_GAME_ID
  let trystero: any = null
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
  let timerInt: any = null
  let heartbeat: any = null
  const transportToLogicalPeer = new Map<string, string>()

  function parseHash(){
    const hash = location.hash // #/sala/abcd12?host=1&name=...
    const m = hash.match(/#\/sala\/([a-z0-9]{6})/)
    salaId = m ? m[1] : ''
    const q = new URLSearchParams(hash.split('?')[1] || '')
    isHostParam = q.get('host') === '1'
    initialName = q.get('name') ? decodeURIComponent(q.get('name')!) : ''
  }

  function showToast(msg:string){
    toast=msg; setTimeout(()=>toast='', 4000)
  }

  function broadcastState(){
    if (!trystero || !isHost) return
    const fullState = gameState
    const msg = { t:'stateSync', juegoId, fullState, version: fullState.version, hostId, peers, joinOrder }
    trystero.send(msg)
  }

  function handleAction(action:any, from:string){
    // solo host aplica reducer
    if (!isHost) return
    const game = getGameModule(juegoId)
    if (!game) return
    if (action.t === 'startGame' && action.juegoId && action.juegoId !== juegoId) return
    // El reducer corre en el host, pero ctx.isHost describe al autor de la acción.
    // Así un invitado puede responder/votar sin poder iniciar o avanzar la partida.
    const ctx = { isHost: from === hostId, peerId: from }
    const next = game.reducer(gameState, action, ctx)
    if (next !== gameState) {
      gameState = next
      gameStore.set(gameState)
      broadcastState()
    }
  }

  function startTimerAndHeartbeat(){
    if (timerInt) clearInterval(timerInt)
    if (heartbeat) clearInterval(heartbeat)
    // El host ofrece un pulso genérico; cada reducer decide si usa `tick`.
    timerInt = setInterval(()=>{
      if (isHost) {
        handleAction({t:'tick'}, selfId)
      }
    }, 1000)
    // heartbeat stateSync cada 2s si host
    heartbeat = setInterval(()=>{
      if (isHost) broadcastState()
    }, 2000)
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

    // iniciar room
    if (isHostParam) {
      if (!nameToUse) nameToUse = assignName(1)
      initRoom(freshSalaId, nameToUse, true)
      // init game
      const initPeers = [{id: selfId, name: nameToUse}] as any
      const game = getGameModule(juegoId)
      const initState = game
        ? game.createInitialState(initPeers)
        : { phase: 'lobby', version: 0, gameId: juegoId }
      gameStore.set(initState); gameState = initState
    } else {
      // guest: asignaremos nombre tras conectar, provisional
      if (!nameToUse) {
        // se asignará al recibir peers, por ahora Jugador ?
        nameToUse = assignName(2)
      }
      initRoom(freshSalaId, nameToUse, false)
    }

    // conectar Trystero
    try {
      trystero = joinTrystero(freshSalaId)
    } catch(e){
      console.error('Trystero error', e)
      showToast('Error conectando P2P')
      return
    }

    // manejar mensajes
    trystero.get((msg:any, peerId:string)=>{
      if (!msg || !msg.t) return
      if (msg.t === 'hello') {
        transportToLogicalPeer.set(peerId, msg.peerId)
        // solo host gestiona hello
        if (isHost) {
          if (isRoomFull(peers.length)) {
            trystero.send({t:'roomFull', salaId})
            return
          }
          const existing = peers.find((p:any)=>p.id===msg.peerId)
          if (!existing) {
            const newPeer = { id: msg.peerId, name: msg.name, joinTime: msg.joinTime }
            peers = [...peers, newPeer]
            joinOrder = [...joinOrder, msg.peerId]
            roomStore.update(v=>({...v, peers, joinOrder, version: v.version+1}))
            const previousState = gameState
            handleAction({ t: 'playerJoined', peerId: msg.peerId }, selfId)
            if (gameState === previousState) broadcastState()
          }
        }
      } else if (msg.t === 'requestState') {
        if (isHost) broadcastState()
      } else if (msg.t === 'stateSync') {
        const incomingJuegoId = msg.juegoId || msg.fullState?.gameId || DEFAULT_GAME_ID
        const gameChanged = incomingJuegoId !== juegoId
        if (gameChanged) {
          juegoId = incomingJuegoId
        }
        // validar version
        if (!gameChanged && msg.version !== undefined && gameState.version !== undefined && msg.version <= gameState.version) {
          // ignorar viejo
          // pero actualizar peers/joinOrder si host cambió
        } else {
          gameState = msg.fullState
          gameStore.set(gameState)
        }
        // actualizar room peers/host
        if (msg.peers) {
          peers = msg.peers
          hostId = msg.hostId
          joinOrder = msg.joinOrder || joinOrder
          // actualizar isHost si somos nuevo host
          const amHost = hostId === selfId
          if (amHost !== isHost) {
            isHost = amHost
            roomStore.update(v=>({...v, hostId, peers, joinOrder, isHost}))
            if (isHost) showToast('Ahora eres el anfitrión')
          } else {
            roomStore.update(v=>({...v, hostId, peers, joinOrder}))
          }
        }
      } else if (msg.t === 'action') {
        const logicalPeerId = transportToLogicalPeer.get(peerId) || msg.from
        if (!msg.juegoId || msg.juegoId === juegoId) handleAction(msg.action, logicalPeerId)
      } else if (msg.t === 'rename') {
        if (isHost) {
          const logicalPeerId = transportToLogicalPeer.get(peerId) || msg.peerId
          peers = peers.map((p:any)=> p.id===logicalPeerId ? {...p, name: msg.newName} : p)
          roomStore.update(v=>({...v, peers}))
          broadcastState()
        }
      } else if (msg.t === 'roomFull') {
        salaFull = true
        showToast('Sala llena (20/20)')
      }
    })

    trystero.onPeerJoin((id:string)=>{
      // enviar hello
      const selfName = (peers.find((p:any)=>p.id===selfId)?.name) || nameToUse
      trystero.send({t:'hello', peerId: selfId, name: selfName, joinTime: Date.now()})
      // si somos host, no-op, peer nos enviará hello
      // si somos guest, pedir estado tras 1s si no llega
      setTimeout(()=>{
        if (!isHost && gameState.phase==='lobby' && peers.length<=1) {
          trystero.send({t:'requestState', from: selfId})
        }
      }, 1200)
    })

    trystero.onPeerLeave((transportPeerId:string)=>{
      const id = transportToLogicalPeer.get(transportPeerId) || transportPeerId
      transportToLogicalPeer.delete(transportPeerId)
      const wasHost = id === hostId
      peers = peers.filter((p:any)=>p.id!==id)
      // joinOrder se mantiene para elección determinista, pero connected set cambia
      const connected = new Set(peers.map((p:any)=>p.id))
      roomStore.update(v=>({...v, peers}))
      if (wasHost) {
        const newHost = electNewHost(joinOrder, connected)
        if (newHost) {
          hostId = newHost
          const amNewHost = newHost === selfId
          isHost = amNewHost
          roomStore.update(v=>({...v, hostId, isHost}))
          if (amNewHost) {
            showToast('El anfitrión se fue — ahora eres el anfitrión')
            broadcastState()
          } else {
            showToast('Anfitrión migrado a ' + (peers.find((p:any)=>p.id===newHost)?.name || newHost.slice(0,4)))
          }
        } else {
          showToast('Sala vacía')
        }
      }
    })

    // si somos host, iniciar timers
    startTimerAndHeartbeat()

    // guest: ya está suscrito, esperar sync

    // si guest, pedir estado inicial
    if (!isHostParam) {
      setTimeout(()=> trystero.send({t:'requestState', from: selfId}), 800)
    }

    return ()=>{
      if (trystero) trystero.leave()
    }
  })

  onDestroy(()=>{
    if (unsubRoom) unsubRoom()
    if (unsubGame) unsubGame()
    if (timerInt) clearInterval(timerInt)
    if (heartbeat) clearInterval(heartbeat)
    if (trystero) trystero.leave()
  })

  function onRename(e:CustomEvent){
    const newName = e.detail as string
    // enviar rename al host
    if (isHost) {
      peers = peers.map((p:any)=> p.id===selfId ? {...p, name:newName} : p)
      roomStore.update(v=>({...v, peers, selfName:newName}))
      broadcastState()
    } else {
      trystero.send({t:'rename', peerId: selfId, newName})
      // optimista local
      roomStore.update(v=>({...v, selfName:newName}))
    }
    showToast('Nombre cambiado a ' + newName)
  }

  function handleGameAction(a:any){
    const action = a.t === 'startGame' ? { ...a, juegoId } : a
    if (isHost) {
      handleAction(action, selfId)
    } else {
      trystero.send({t:'action', juegoId, action, from: selfId})
    }
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

    <ShareLink {salaId} />

    <div style="display:grid;gap:1rem;margin-top:1rem">
      <div>
        <Game {juegoId} onAction={handleGameAction} />
      </div>
      <div>
        <h3>Jugadores ({peers.length}/20)</h3>
        <PlayerList peers={peers} hostId={hostId} />
        <div style="margin-top:1rem">
          <h4>Cambiar nombre</h4>
          <NameInput value={peers.find(p=>p.id===selfId)?.name || ''} on:save={onRename} />
        </div>
      </div>
    </div>
  {:else}
    <!-- ============ JUEGO ============ -->
    <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.8rem">
      <span class="muted" style="font-size:0.85rem"><code>{salaId}</code></span>
      <button on:click={salir} style="background:var(--muted);padding:0.3rem 0.7rem;font-size:0.85rem">Salir</button>
    </div>

    <Game {juegoId} onAction={handleGameAction} />
  {/if}
</div>
