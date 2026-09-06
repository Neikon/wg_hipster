import { electNewHost, isRoomFull } from './room'
import type { Peer } from './types'

export interface GameModuleLike {
  reducer: (state: any, action: any, ctx: { isHost: boolean; peerId: string }) => any
}

export type SyncEvent =
  | { t: 'room'; peers: Peer[]; joinOrder: string[]; hostId: string; isHost: boolean; selfName: string }
  | { t: 'game'; state: any }
  | { t: 'toast'; msg: string }
  | { t: 'salaFull' }

export interface SyncNodeOpts {
  salaId: string
  selfId: string
  selfName: string
  /** true si este nodo crea la sala como anfitrión */
  isHost: boolean
  hostId: string
  juegoId: string
  initialGameState: any
  getGameModule: (id: string) => GameModuleLike | null
  send: (msg: any) => void
  emit: (e: SyncEvent) => void
  now?: () => number
}

export interface SyncSnapshot {
  selfId: string
  selfName: string
  peers: Peer[]
  joinOrder: string[]
  hostId: string
  isHost: boolean
  juegoId: string
  gameState: any
  salaFull: boolean
  syncedOnce: boolean
}

/**
 * Protocolo P2P de la sala (extraído de Room.svelte para poder testearlo):
 * hello / requestState / stateSync / action / rename, heartbeat del host
 * cada 2 s, tick de juego cada 1 s y migración de host.
 *
 * Dos garantías para uniones tardías o lentas (móviles):
 * - el invitado se incluye a sí mismo desde el inicio (nunca ve sala vacía);
 * - el invitado reintenta requestState cada 2 s hasta recibir su primer sync.
 */
export class SyncNode {
  private salaId: string
  private selfId: string
  private selfName: string
  private peers: Peer[]
  private joinOrder: string[]
  private hostId: string
  private isHost: boolean
  private juegoId: string
  private gameState: any
  private salaFull = false
  private syncedOnce: boolean
  private transportToLogicalPeer = new Map<string, string>()
  private tickCount = 0
  private getGameModule: (id: string) => GameModuleLike | null
  private send: (msg: any) => void
  private emitEv: (e: SyncEvent) => void
  private now: () => number

  constructor(opts: SyncNodeOpts) {
    this.salaId = opts.salaId
    this.selfId = opts.selfId
    this.selfName = opts.selfName
    this.isHost = opts.isHost
    this.hostId = opts.hostId
    this.juegoId = opts.juegoId
    this.gameState = opts.initialGameState
    this.getGameModule = opts.getGameModule
    this.send = opts.send
    this.emitEv = opts.emit
    this.now = opts.now ?? (() => Date.now())
    // El propio nodo siempre está en su lista (antes el invitado veía sala vacía).
    const self: Peer = { id: opts.selfId, name: opts.selfName, joinTime: this.now() }
    this.peers = [self]
    this.joinOrder = [opts.selfId]
    this.syncedOnce = opts.isHost
  }

  snapshot(): SyncSnapshot {
    return {
      selfId: this.selfId,
      selfName: this.selfName,
      peers: [...this.peers],
      joinOrder: [...this.joinOrder],
      hostId: this.hostId,
      isHost: this.isHost,
      juegoId: this.juegoId,
      gameState: this.gameState,
      salaFull: this.salaFull,
      syncedOnce: this.syncedOnce
    }
  }

  private emitRoom() {
    this.emitEv({
      t: 'room',
      peers: [...this.peers],
      joinOrder: [...this.joinOrder],
      hostId: this.hostId,
      isHost: this.isHost,
      selfName: this.selfName
    })
  }

  /** Llamar al conectar el transporte (el invitado pide estado). */
  start() {
    if (!this.isHost) this.send({ t: 'requestState', from: this.selfId })
  }

  private broadcastState() {
    if (!this.isHost) return
    const msg = {
      t: 'stateSync',
      juegoId: this.juegoId,
      fullState: this.gameState,
      version: this.gameState.version,
      hostId: this.hostId,
      peers: this.peers,
      joinOrder: this.joinOrder
    }
    this.send(msg)
  }

  private handleAction(action: any, from: string) {
    // solo el host aplica el reducer
    if (!this.isHost) return
    const game = this.getGameModule(this.juegoId)
    if (!game) return
    if (action.t === 'startGame' && action.juegoId && action.juegoId !== this.juegoId) return
    // El reducer corre en el host, pero ctx.isHost describe al autor de la acción.
    const ctx = { isHost: from === this.hostId, peerId: from }
    const next = game.reducer(this.gameState, action, ctx)
    if (next !== this.gameState) {
      this.gameState = next
      this.emitEv({ t: 'game', state: this.gameState })
      this.broadcastState()
    }
  }

  /** Un tick por segundo (lo llama el componente con setInterval). */
  tickSecond() {
    this.tickCount++
    if (this.isHost) {
      this.handleAction({ t: 'tick' }, this.selfId)
      // heartbeat stateSync cada 2 s si host
      if (this.tickCount % 2 === 0) this.broadcastState()
    } else if (!this.syncedOnce && this.tickCount % 2 === 0) {
      // invitado aún sin sincronizar: reintentar hasta que llegue el primer sync
      this.send({ t: 'requestState', from: this.selfId })
    }
  }

  /** Acción de juego originada en la UI local. */
  gameAction(a: any) {
    const action = a.t === 'startGame' ? { ...a, juegoId: this.juegoId } : a
    if (this.isHost) {
      this.handleAction(action, this.selfId)
    } else {
      this.send({ t: 'action', juegoId: this.juegoId, action, from: this.selfId })
    }
  }

  rename(newName: string) {
    if (this.isHost) {
      this.peers = this.peers.map((p) => (p.id === this.selfId ? { ...p, name: newName } : p))
      this.selfName = newName
      this.emitRoom()
      this.broadcastState()
    } else {
      this.send({ t: 'rename', peerId: this.selfId, newName })
      // optimista local
      this.selfName = newName
      this.emitRoom()
    }
  }

  receive(msg: any, transportPeerId: string) {
    if (!msg || !msg.t) return
    if (msg.t === 'hello') {
      this.transportToLogicalPeer.set(transportPeerId, msg.peerId)
      // solo el host gestiona hello
      if (this.isHost) {
        if (isRoomFull(this.peers.length)) {
          this.send({ t: 'roomFull', salaId: this.salaId })
          return
        }
        const existing = this.peers.find((p) => p.id === msg.peerId)
        if (!existing) {
          const newPeer: Peer = { id: msg.peerId, name: msg.name, joinTime: msg.joinTime }
          this.peers = [...this.peers, newPeer]
          this.joinOrder = [...this.joinOrder, msg.peerId]
          this.emitRoom()
          const previousState = this.gameState
          this.handleAction({ t: 'playerJoined', peerId: msg.peerId }, this.selfId)
          if (this.gameState === previousState) this.broadcastState()
        }
      }
    } else if (msg.t === 'requestState') {
      if (this.isHost) this.broadcastState()
    } else if (msg.t === 'stateSync') {
      const incomingJuegoId = msg.juegoId || msg.fullState?.gameId
      const gameChanged = incomingJuegoId !== undefined && incomingJuegoId !== this.juegoId
      if (gameChanged) {
        this.juegoId = incomingJuegoId
      }
      // validar version
      if (
        !gameChanged &&
        msg.version !== undefined &&
        this.gameState.version !== undefined &&
        msg.version <= this.gameState.version
      ) {
        // ignorar viejo, pero actualizar peers/host abajo
      } else {
        this.gameState = msg.fullState
        this.emitEv({ t: 'game', state: this.gameState })
      }
      this.syncedOnce = true
      // actualizar room peers/host
      if (msg.peers) {
        this.peers = msg.peers
        this.hostId = msg.hostId
        this.joinOrder = msg.joinOrder || this.joinOrder
        const amHost = this.hostId === this.selfId
        if (amHost !== this.isHost) {
          this.isHost = amHost
          if (this.isHost) this.emitEv({ t: 'toast', msg: 'Ahora eres el anfitrión' })
        }
        this.emitRoom()
      }
    } else if (msg.t === 'action') {
      const logicalPeerId = this.transportToLogicalPeer.get(transportPeerId) || msg.from
      if (!msg.juegoId || msg.juegoId === this.juegoId) this.handleAction(msg.action, logicalPeerId)
    } else if (msg.t === 'rename') {
      if (this.isHost) {
        const logicalPeerId = this.transportToLogicalPeer.get(transportPeerId) || msg.peerId
        this.peers = this.peers.map((p) => (p.id === logicalPeerId ? { ...p, name: msg.newName } : p))
        this.emitRoom()
        this.broadcastState()
      }
    } else if (msg.t === 'roomFull') {
      this.salaFull = true
      this.emitEv({ t: 'salaFull' })
      this.emitEv({ t: 'toast', msg: 'Sala llena (20/20)' })
    }
  }

  peerJoined(transportPeerId: string) {
    // enviar hello
    const selfName = this.peers.find((p) => p.id === this.selfId)?.name || this.selfName
    this.send({ t: 'hello', peerId: this.selfId, name: selfName, joinTime: this.now() })
    // invitado aún sin sincronizar: pedir estado al aparecer un peer
    if (!this.isHost && !this.syncedOnce) {
      this.send({ t: 'requestState', from: this.selfId })
    }
    void transportPeerId
  }

  peerLeft(transportPeerId: string) {
    const id = this.transportToLogicalPeer.get(transportPeerId) || transportPeerId
    this.transportToLogicalPeer.delete(transportPeerId)
    const wasHost = id === this.hostId
    this.peers = this.peers.filter((p) => p.id !== id)
    // joinOrder se mantiene para elección determinista, pero connected set cambia
    const connected = new Set(this.peers.map((p) => p.id))
    this.emitRoom()
    if (wasHost) {
      const newHost = electNewHost(this.joinOrder, connected)
      if (newHost) {
        this.hostId = newHost
        const amNewHost = newHost === this.selfId
        this.isHost = amNewHost
        this.emitRoom()
        if (amNewHost) {
          this.emitEv({ t: 'toast', msg: 'El anfitrión se fue — ahora eres el anfitrión' })
          this.broadcastState()
        } else {
          const nm = this.peers.find((p) => p.id === newHost)?.name || newHost.slice(0, 4)
          this.emitEv({ t: 'toast', msg: 'Anfitrión migrado a ' + nm })
        }
      } else {
        this.emitEv({ t: 'toast', msg: 'Sala vacía' })
      }
    }
  }
}
