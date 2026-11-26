import type { GameReplication } from '../game/types'
import { sanitizeName } from '../utils/names'
import { electNewHost, isRoomFull } from './room'
import type { Peer } from './types'

export interface GameModuleLike {
  reducer: (state: any, action: any, ctx: { isHost: boolean; peerId: string }) => any
  replication?: GameReplication<any>
}

interface ConnectedPeer extends Peer {
  transportId: string
}

export type SyncEvent =
  | { t: 'room'; peers: Peer[]; joinOrder: string[]; hostId: string; hostTransportId: string; isHost: boolean; selfName: string }
  | { t: 'game'; state: any }
  | { t: 'toast'; msg: string }
  | { t: 'salaFull' }
  | { t: 'synced' }

export interface SyncNodeOpts {
  salaId: string
  selfId: string
  selfName: string
  selfTransportId?: string
  isHost: boolean
  hostId: string
  hostTransportId?: string
  juegoId: string
  initialGameState: any
  getGameModule: (id: string) => GameModuleLike | null
  send: (msg: any, transportPeerId?: string) => void
  emit: (e: SyncEvent) => void
  now?: () => number
}

type Answer = { t: 'answer'; opcion: number } | { t: 'answerTexto'; texto: string }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const idValido = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !Object.hasOwn(Object.prototype, id)

function peerValido(peer: unknown): peer is ConnectedPeer {
  return record(peer) && idValido(peer.id) && idValido(peer.transportId)
    && typeof peer.name === 'string' && sanitizeName(peer.name) === peer.name
    && typeof peer.joinTime === 'number' && Number.isFinite(peer.joinTime)
}

function answerValida(value: unknown): value is Answer {
  return record(value) && (value.t === 'answer'
    ? Number.isInteger(value.opcion)
    : value.t === 'answerTexto' && typeof value.texto === 'string' && value.texto.length <= 140)
}

export class SyncNode {
  private readonly selfId: string
  private readonly selfTransportId: string
  private selfName: string
  private peers: ConnectedPeer[]
  private hostId: string
  private hostTransportId: string
  private isHost: boolean
  private readonly juegoId: string
  private gameState: any
  private salaFull = false
  private syncedOnce: boolean
  private revision = 0
  private gameRun = 0
  private tickCount = 0
  private disconnected = new Set<string>()
  private delayedHellos = new Map<string, number>()
  private pendingAnswer: { action: Answer; gameRun: number; ronda: number; sequence: number; retries: number } | null = null
  private answerSequence = 0
  private receivedAnswers = new Map<string, number>()
  private recoveryDeck: Record<string, unknown> | null = null
  private recoveryState: any = null
  private deckConfirmedBy: string | null = null
  private now: () => number

  constructor(private readonly opts: SyncNodeOpts) {
    this.selfId = opts.selfId
    this.selfName = opts.selfName
    this.selfTransportId = opts.selfTransportId ?? opts.selfId
    this.isHost = opts.isHost
    this.hostId = opts.hostId
    this.hostTransportId = opts.isHost ? this.selfTransportId : opts.hostTransportId ?? ''
    this.juegoId = opts.juegoId
    this.gameState = opts.initialGameState
    this.now = opts.now ?? Date.now
    this.peers = [{ id: this.selfId, name: this.selfName, joinTime: this.now(), transportId: this.selfTransportId }]
    this.syncedOnce = opts.isHost
  }

  snapshot() {
    return {
      ...this.roomSnapshot(),
      selfId: this.selfId,
      juegoId: this.juegoId,
      gameState: this.gameState,
      salaFull: this.salaFull,
      syncedOnce: this.syncedOnce
    }
  }

  private roomSnapshot() {
    return {
      peers: [...this.peers],
      joinOrder: this.peers.map((peer) => peer.id),
      hostId: this.hostId,
      hostTransportId: this.hostTransportId,
      isHost: this.isHost,
      selfName: this.selfName
    }
  }

  private emitRoom() {
    this.opts.emit({ t: 'room', ...this.roomSnapshot() })
  }

  private hello(transportPeerId?: string) {
    this.opts.send({ t: 'hello', peerId: this.selfId, name: this.selfName, joinTime: this.peers.find((p) => p.id === this.selfId)?.joinTime ?? this.now() }, transportPeerId)
  }

  start() {
    if (!this.isHost) this.hello(this.hostTransportId || undefined)
  }

  private get replication() {
    return this.opts.getGameModule(this.juegoId)?.replication
  }

  private successor() {
    return this.peers.find((peer) => peer.id !== this.hostId && !this.disconnected.has(peer.transportId))
  }

  private broadcastState(only?: string) {
    if (!this.isHost) return
    const revision = ++this.revision
    const replication = this.replication
    const roster = [...this.peers]
    for (const peer of roster) {
      if (peer.id === this.selfId || (only && peer.transportId !== only)) continue
      this.opts.send({
        t: 'stateSync',
        juegoId: this.juegoId,
        fullState: replication?.publicState(this.gameState, peer.id) ?? this.gameState,
        version: this.gameState.version,
        revision,
        gameRun: this.gameRun,
        hostId: this.hostId,
        peers: roster
      }, peer.transportId)
    }

    const successor = this.successor()
    if (!replication || !successor || (only && successor.transportId !== only)) return
    const { state, deck } = replication.recovery(this.gameState)
    this.opts.send({
      t: 'hostBackup',
      gameRun: this.gameRun,
      state,
      ...(this.deckConfirmedBy === successor.transportId ? {} : { deck })
    }, successor.transportId)
  }

  private handleAction(action: any, from: string) {
    if (!this.isHost) return false
    const game = this.opts.getGameModule(this.juegoId)
    if (!game) return false
    const next = game.reducer(this.gameState, action, { isHost: from === this.selfId, peerId: from })
    if (next === this.gameState) return false
    if (action.t === 'startGame' || action.t === 'restart') {
      this.gameRun = next.version
      this.deckConfirmedBy = null
      this.receivedAnswers.clear()
    }
    this.gameState = next
    this.opts.emit({ t: 'game', state: next })
    this.broadcastState()
    return true
  }

  tickSecond() {
    this.tickCount++
    let repeatedHello = false
    for (const [peerId, tick] of this.delayedHellos) {
      if (tick > this.tickCount) continue
      this.delayedHellos.delete(peerId)
      this.hello(peerId)
      repeatedHello = true
    }
    const heartbeat = this.tickCount % 2 === 0
    if (this.isHost) {
      if (!this.handleAction({ t: 'tick' }, this.selfId) && heartbeat) this.broadcastState()
    } else if (heartbeat) {
      if (!repeatedHello && (!this.syncedOnce || this.disconnected.has(this.hostTransportId))) this.start()
      this.retryAnswer()
    }
  }

  private retryAnswer() {
    const answer = this.pendingAnswer
    if (!answer) return
    const previous = this.gameState.respuestas?.[this.selfId]
    const expected = answer.action.t === 'answer' ? answer.action.opcion : answer.action.texto
    if (previous === expected || this.gameState.phase !== 'pregunta'
      || this.gameRun !== answer.gameRun || this.gameState.ronda !== answer.ronda || answer.retries >= 30) {
      this.pendingAnswer = null
      return
    }
    answer.retries++
    this.sendAnswer(answer)
  }

  private sendAnswer(answer: NonNullable<SyncNode['pendingAnswer']>) {
    const { action, gameRun, ronda, sequence } = answer
    if (this.hostTransportId) this.opts.send({ t: 'action', action, gameRun, ronda, sequence }, this.hostTransportId)
  }

  gameAction(action: any) {
    if (this.isHost) {
      this.handleAction(action, this.selfId)
    } else if (this.syncedOnce && this.gameState.phase === 'pregunta' && answerValida(action)) {
      this.pendingAnswer = {
        action, gameRun: this.gameRun, ronda: this.gameState.ronda, sequence: ++this.answerSequence, retries: 0
      }
      this.sendAnswer(this.pendingAnswer)
    }
  }

  rename(name: string) {
    const newName = sanitizeName(name)
    if (!newName) return
    this.selfName = newName
    if (this.isHost) {
      this.renamePeer(this.selfId, newName)
    } else {
      this.emitRoom()
      if (this.hostTransportId) this.opts.send({ t: 'rename', newName }, this.hostTransportId)
    }
  }

  private renamePeer(peerId: string, name: string) {
    this.peers = this.peers.map((peer) => peer.id === peerId ? { ...peer, name } : peer)
    this.emitRoom()
    this.broadcastState()
  }

  receive(msg: unknown, transportPeerId: string) {
    if (!record(msg) || !idValido(transportPeerId)) return
    if (this.isHost) {
      this.receiveAsHost(msg, transportPeerId)
      return
    }
    if (this.hostTransportId && transportPeerId !== this.hostTransportId) return
    if (msg.t === 'stateSync') this.receiveState(msg, transportPeerId)
    if (msg.t === 'hostBackup' && this.syncedOnce && this.successor()?.id === this.selfId) {
      this.receiveBackup(msg, transportPeerId)
    }
    if (msg.t === 'roomFull' && !this.syncedOnce && !this.salaFull && msg.salaId === this.opts.salaId) {
      this.salaFull = true
      this.opts.emit({ t: 'salaFull' })
      this.opts.emit({ t: 'toast', msg: 'Sala llena (20/20)' })
    }
  }

  private receiveAsHost(msg: Record<string, unknown>, transportPeerId: string) {
    const peer = this.peers.find((p) => p.transportId === transportPeerId)
    if (msg.t === 'hello') {
      this.admit(msg, transportPeerId, peer)
      return
    }
    if (!peer || peer.id === this.selfId) return
    if (msg.t === 'rename' && typeof msg.newName === 'string') {
      const name = sanitizeName(msg.newName)
      if (name && name !== peer.name) this.renamePeer(peer.id, name)
    }
    if (msg.t === 'deckAck' && msg.gameRun === this.gameRun && this.successor()?.id === peer.id) {
      this.deckConfirmedBy = peer.transportId
    }
    if (msg.t === 'action' && msg.gameRun === this.gameRun && msg.ronda === this.gameState.ronda
      && typeof msg.sequence === 'number' && Number.isSafeInteger(msg.sequence)
      && msg.sequence > (this.receivedAnswers.get(peer.id) ?? 0) && answerValida(msg.action)) {
      this.receivedAnswers.set(peer.id, msg.sequence)
      this.handleAction(msg.action, peer.id)
    }
  }

  private admit(msg: Record<string, unknown>, transportId: string, peer?: ConnectedPeer) {
    if (peer) {
      if (peer.id === msg.peerId && peer.id !== this.selfId) this.broadcastState(transportId)
      return
    }
    const name = typeof msg.name === 'string' ? sanitizeName(msg.name) : null
    if (!idValido(msg.peerId) || !name || this.peers.some((p) => p.id === msg.peerId)) return
    if (isRoomFull(this.peers.length)) {
      this.opts.send({ t: 'roomFull', salaId: this.opts.salaId }, transportId)
      return
    }
    this.peers = [...this.peers, { id: msg.peerId, name, transportId, joinTime: this.now() }]
    this.emitRoom()
    if (!this.handleAction({ t: 'playerJoined', peerId: msg.peerId }, this.selfId)) this.broadcastState()
  }

  private receiveState(msg: Record<string, unknown>, transportId: string) {
    if (msg.juegoId !== this.juegoId || !idValido(msg.hostId) || msg.hostId === this.selfId
      || (this.hostId && msg.hostId !== this.hostId)
      || typeof msg.revision !== 'number' || !Number.isSafeInteger(msg.revision) || msg.revision <= this.revision
      || typeof msg.gameRun !== 'number' || !Number.isSafeInteger(msg.gameRun)
      || (this.revision > 0 && msg.gameRun < this.gameRun)
      || !Array.isArray(msg.peers) || msg.peers.length > 20 || !msg.peers.every(peerValido)
      || !record(msg.fullState) || msg.fullState.gameId !== this.juegoId
      || typeof msg.fullState.phase !== 'string' || !Number.isSafeInteger(msg.fullState.version)
      || msg.fullState.version !== msg.version) return
    const peers: ConnectedPeer[] = msg.peers
    if (new Set(peers.map((p) => p.id)).size !== peers.length
      || new Set(peers.map((p) => p.transportId)).size !== peers.length
      || !peers.some((p) => p.id === msg.hostId && p.transportId === transportId)
      || !peers.some((p) => p.id === this.selfId && p.transportId === this.selfTransportId)
      || (this.replication && !this.replication.validState(msg.fullState))) return

    const newRun = this.gameRun !== msg.gameRun
    if (newRun) {
      this.recoveryDeck = null
      this.recoveryState = null
      this.pendingAnswer = null
    }
    this.revision = msg.revision
    this.gameRun = msg.gameRun
    this.hostId = msg.hostId
    this.hostTransportId = transportId
    this.disconnected.delete(transportId)
    this.peers = peers
    if (!this.syncedOnce || newRun || this.gameState.version !== msg.version) {
      this.gameState = msg.fullState
      this.opts.emit({ t: 'game', state: this.gameState })
    }
    this.emitRoom()
    if (!this.syncedOnce) {
      this.syncedOnce = true
      this.salaFull = false
      this.opts.emit({ t: 'synced' })
    }
  }

  private receiveBackup(msg: Record<string, unknown>, transportId: string) {
    if (msg.gameRun !== this.gameRun || !record(msg.state)) return
    const deck = record(msg.deck) ? msg.deck : this.recoveryDeck
    if (!deck) return
    const state = { ...msg.state, ...deck }
    if (typeof state.version !== 'number' || !this.replication?.validState(state)) return
    if (record(msg.deck)) {
      this.recoveryDeck = deck
      this.opts.send({ t: 'deckAck', gameRun: this.gameRun }, transportId)
    }
    if (!this.recoveryState || state.version >= this.recoveryState.version) this.recoveryState = state
  }

  peerJoined(transportPeerId: string) {
    this.disconnected.delete(transportPeerId)
    if (this.isHost || (this.hostTransportId && transportPeerId !== this.hostTransportId)) return
    this.hello(transportPeerId)
    this.delayedHellos.set(transportPeerId, this.tickCount + 2)
  }

  peerLeft(transportPeerId: string) {
    this.delayedHellos.delete(transportPeerId)
    const peer = this.peers.find((p) => p.transportId === transportPeerId)
    if (!peer || peer.id === this.selfId) return
    this.disconnected.add(transportPeerId)
    if (this.isHost) {
      this.removePeer(peer.id)
      return
    }
    if (peer.id !== this.hostId) return

    this.peers = this.peers.filter((p) => p.id !== peer.id)
    const reachable = new Set(this.peers.filter((p) => !this.disconnected.has(p.transportId)).map((p) => p.id))
    const nextId = electNewHost(this.peers.map((p) => p.id), reachable)
    const next = this.peers.find((p) => p.id === nextId)
    if (!next) return
    this.hostId = next.id
    this.hostTransportId = next.transportId
    this.isHost = next.id === this.selfId
    this.revision = 0
    this.emitRoom()
    if (!this.isHost) {
      this.opts.emit({ t: 'toast', msg: 'Anfitrión migrado a ' + next.name })
      return
    }

    this.opts.emit({ t: 'toast', msg: 'El anfitrión se fue — ahora eres el anfitrión' })
    if (this.recoveryState) {
      this.gameState = { ...this.recoveryState, version: Math.max(this.gameState.version, this.recoveryState.version) + 1 }
    } else if (this.replication && this.gameState.phase !== 'lobby' && this.gameState.phase !== 'final') {
      this.gameState = { ...this.gameState, phase: 'final', version: this.gameState.version + 1 }
      this.opts.emit({ t: 'toast', msg: 'Se conservan los puntos. Vuelve al lobby para jugar otra partida.' })
    }
    const departed = this.peers.filter((p) => this.disconnected.has(p.transportId))
    this.peers = this.peers.filter((p) => !this.disconnected.has(p.transportId))
    const game = this.opts.getGameModule(this.juegoId)
    for (const id of [peer.id, ...departed.map((p) => p.id)]) {
      if (game) this.gameState = game.reducer(this.gameState, { t: 'playerLeft', peerId: id }, {
        isHost: true, peerId: this.selfId
      })
    }
    this.recoveryState = null
    this.recoveryDeck = null
    this.deckConfirmedBy = null
    this.emitRoom()
    this.opts.emit({ t: 'game', state: this.gameState })
    this.broadcastState()
  }

  private removePeer(id: string) {
    this.peers = this.peers.filter((p) => p.id !== id)
    this.receivedAnswers.delete(id)
    this.emitRoom()
    if (!this.handleAction({ t: 'playerLeft', peerId: id }, this.selfId)) {
      this.opts.emit({ t: 'game', state: this.gameState })
      this.broadcastState()
    }
  }
}
