import { describe, it, expect } from 'vitest'
import { SyncNode } from '../../src/lib/net/syncEngine'
import type { SyncEvent } from '../../src/lib/net/syncEngine'
import { getGameModule } from '../../src/lib/game/registry'
import { TRACKS } from '../../src/lib/game/hipster/tracks'

interface Nodo {
  id: string
  t: string
  node: SyncNode
}

/** Bus P2P síncrono con pérdida selectiva: control total de entregas. */
class Bus {
  nodos = new Map<string, Nodo>()
  private tiradas = new Set<number>()
  private n = 0
  pendientes: Array<{ from: string; to?: string; msg: any; idx: number }> = []

  conectar(id: string, isHost: boolean): Nodo {
    const t = `t-${id}`
    const game = getGameModule('hipster')!
    const nodo: Nodo = {
      id,
      t,
      node: new SyncNode({
        salaId: 'sala1',
        selfId: id,
        selfName: `Jugador ${id}`,
        isHost,
        hostId: isHost ? id : '',
        juegoId: 'hipster',
        initialGameState: isHost
          ? game.createInitialState([{ id }])
          : { phase: 'lobby', version: 0, gameId: 'hipster' },
        getGameModule: (gid: string) => getGameModule(gid),
        selfTransportId: t,
        send: (msg: any, to?: string) => {
          this.n++;
          this.pendientes.push({ from: id, to, msg, idx: this.n })
        },
        emit: (_e: SyncEvent) => {},
        now: () => 0
      })
    }
    // malla: el nuevo ve a los presentes y viceversa
    for (const otro of this.nodos.values()) {
      otro.node.peerJoined(t)
      nodo.node.peerJoined(otro.t)
    }
    this.nodos.set(t, nodo)
    return nodo
  }

  /** Entrega todo salvo los índices marcados para tirar. */
  flush(tirar: number[] = []) {
    const ts = new Set(tirar)
    const cola = this.pendientes
    this.pendientes = []
    for (const { from, to, msg, idx } of cola) {
      if (ts.has(idx)) continue
      const emisor = [...this.nodos.values()].find((n) => n.id === from)!
      for (const destino of this.nodos.values()) {
        if (destino.t === emisor.t || (to && destino.t !== to)) continue
        destino.node.receive(msg, emisor.t)
      }
    }
  }

  ticks(n: number) {
    for (let i = 0; i < n; i++) for (const nodo of this.nodos.values()) nodo.node.tickSecond()
  }

  fase(id: string) {
    return this.nodos.get(`t-${id}`)!.node.snapshot().gameState.phase
  }

  quitar(id: string) {
    const t = `t-${id}`
    this.nodos.delete(t)
    this.pendientes = this.pendientes.filter((mensaje) => mensaje.from !== id)
    for (const nodo of this.nodos.values()) nodo.node.peerLeft(t)
  }
}

function empezarAnio(bus: Bus, hostId: string) {
  const host = bus.nodos.get(`t-${hostId}`)!
  host.node.gameAction({
    t: 'startGame',
    config: { modo: 'anio' },
    tracks: [...TRACKS],
    pool: [...TRACKS]
  })
  bus.flush()
}

function responderAnio(bus: Bus, id: string, anio: number) {
  bus.nodos.get(`t-${id}`)!.node.gameAction({ t: 'answer', opcion: anio })
  bus.flush()
}

describe('ronda robusta (modo año, 3 jugadores)', () => {
  it('mantiene privada la ronda y continúa con el sucesor cuando sale el anfitrión', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    const a = bus.conectar('a', false)
    const b = bus.conectar('b', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    responderAnio(bus, 'a', 2000)
    bus.flush()
    const vista = b.node.snapshot().gameState
    expect(vista.pool).toEqual([])
    expect(vista.tracks.filter(Boolean)).toHaveLength(1)
    expect(vista.tracks[vista.ronda].anio).toBeNull()
    expect(vista.tracks[vista.ronda].artworkUrl).toBe('')
    expect(vista.respuestas).toEqual({})
    expect(vista.respondieron).toEqual(['a'])

    bus.quitar('host')
    bus.flush()
    expect(a.node.snapshot().isHost).toBe(true)
    responderAnio(bus, 'b', 2000)
    bus.flush()
    expect(bus.fase('a')).toBe('resultados')
    expect(bus.fase('b')).toBe('resultados')
    expect(a.node.snapshot().gameState.puntos).not.toHaveProperty('host')
  })

  it('solo envía la baraja al sucesor y deja de enviarla cuando la confirma', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    bus.conectar('a', false)
    bus.conectar('b', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    bus.flush() // confirmación de la baraja privada
    bus.ticks(1)
    const backups = bus.pendientes.filter(({ msg }) => msg.t === 'hostBackup')
    expect(backups).toHaveLength(1)
    expect(backups[0].to).toBe('t-a')
    expect(backups[0].msg).not.toHaveProperty('deck')
  })

  it('descarta una respuesta de la ronda anterior', () => {
    const bus = new Bus()
    const host = bus.conectar('host', true)
    const a = bus.conectar('a', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    a.node.gameAction({ t: 'answer', opcion: 2000 })
    const tarde = bus.pendientes.find(({ msg }) => msg.t === 'action')!
    bus.flush()
    responderAnio(bus, 'host', 2000)
    host.node.gameAction({ t: 'next' })
    bus.flush()
    host.node.receive(tarde.msg, a.t)
    expect(host.node.snapshot().gameState.respuestas).toEqual({})
  })

  it('acepta la réplica del sucesor aunque no haya recibido la última partida del anfitrión', () => {
    const bus = new Bus()
    const host = bus.conectar('host', true)
    bus.conectar('a', false)
    bus.conectar('b', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    host.node.gameAction({ t: 'startGame', tracks: TRACKS })
    bus.flush(bus.pendientes.filter(({ to }) => to === 't-a').map(({ idx }) => idx))
    expect(bus.fase('a')).toBe('lobby')
    expect(bus.fase('b')).toBe('pregunta')
    bus.quitar('host')
    bus.flush()
    expect(bus.fase('b')).toBe('lobby')
  })

  it('quita del juego los jugadores que se desconectaron antes del relevo', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    const a = bus.conectar('a', false)
    bus.conectar('b', false)
    bus.conectar('c', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    bus.quitar('b')
    bus.quitar('host')
    expect(Object.keys(a.node.snapshot().gameState.puntos)).toEqual(['a', 'c'])
  })

  it('avanza cuando responden todos', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    bus.conectar('a', false)
    bus.conectar('b', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    expect(bus.fase('host')).toBe('pregunta')
    responderAnio(bus, 'a', 2000)
    responderAnio(bus, 'b', 2000)
    responderAnio(bus, 'host', 2000)
    expect(bus.fase('host')).toBe('resultados')
    expect(bus.fase('a')).toBe('resultados')
    expect(bus.fase('b')).toBe('resultados')
  })

  it('avanza si un jugador abandona a mitad de ronda', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    bus.conectar('a', false)
    bus.conectar('b', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    // b se va sin responder: el host lo detecta a nivel transporte
    const host = bus.nodos.get('t-host')!
    host.node.peerLeft('t-b')
    bus.nodos.get('t-a')!.node.peerLeft('t-b')
    bus.flush()
    responderAnio(bus, 'a', 2000)
    responderAnio(bus, 'host', 2000)
    expect(bus.fase('host')).toBe('resultados')
    expect(bus.fase('a')).toBe('resultados')
  })

  it('avanza aunque se pierda la primera respuesta de un invitado', () => {
    const bus = new Bus()
    bus.conectar('host', true)
    bus.conectar('a', false)
    bus.flush()
    bus.ticks(4)
    bus.flush()
    empezarAnio(bus, 'host')
    // la respuesta de 'a' se pierde por la red (no se entrega)
    const antes = bus.pendientes.length
    bus.nodos.get('t-a')!.node.gameAction({ t: 'answer', opcion: 2000 })
    const perdidos = bus.pendientes.slice(antes).map((p) => p.idx)
    bus.flush(perdidos)
    responderAnio(bus, 'host', 2000)
    expect(bus.fase('host')).toBe('pregunta')
    // el invitado reintenta solo y la ronda avanza sin esperar al timer
    bus.ticks(4)
    bus.flush()
    expect(bus.fase('host')).toBe('resultados')
  })
})
