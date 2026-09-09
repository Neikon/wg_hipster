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
  pendientes: Array<{ from: string; msg: any; idx: number }> = []

  conectar(id: string, isHost: boolean): Nodo {
    const t = `t-${id}`
    const game = getGameModule('hipster')!
    const nodo: Nodo = {
      id,
      t,
      node: new SyncNode({
        salaId: 'sala1',
        selfId: id,
        selfName: id,
        isHost,
        hostId: isHost ? id : '',
        juegoId: 'hipster',
        initialGameState: isHost
          ? game.createInitialState([{ id }])
          : { phase: 'lobby', version: 0, gameId: 'hipster' },
        getGameModule: (gid: string) => getGameModule(gid),
        send: (msg: any) => {
          this.n++;
          this.pendientes.push({ from: id, msg, idx: this.n })
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
    for (const { from, msg, idx } of cola) {
      if (ts.has(idx)) continue
      const emisor = [...this.nodos.values()].find((n) => n.id === from)!
      for (const destino of this.nodos.values()) {
        if (destino.t === emisor.t) continue
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
