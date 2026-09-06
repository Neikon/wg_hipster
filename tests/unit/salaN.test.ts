import { describe, it, expect } from 'vitest'
import { SyncNode } from '../../src/lib/net/syncEngine'
import { getGameModule } from '../../src/lib/game/registry'

interface Entrega {
  at: number
  to: string
  msg: any
  fromTransport: string
}

interface NodoVirtual {
  id: string
  node: SyncNode
  transportId: string
}

/**
 * Hub P2P falso con reloj virtual: conecta N nodos con retardos por enlace
 * y pérdida de mensajes, como una WiFi de fiesta con móviles lentos.
 */
class Hub {
  now = 0
  private nodos = new Map<string, NodoVirtual>()
  private cola: Entrega[] = []
  /** ms de retardo según (emisor → receptor) */
  private retardos = new Map<string, number>()
  /** nº de mensajes a tirar por receptor (simula handshake lento) */
  private tirar: Map<string, number>

  constructor(tirarPrimeros = 0) {
    this.tirar = new Map()
    void tirarPrimeros
  }

  private clave(from: string, to: string) {
    return `${from}>${to}`
  }

  setRetardo(from: string, to: string, ms: number) {
    this.retardos.set(this.clave(from, to), ms)
  }

  /** Tira los próximos N mensajes dirigidos a ese nodo. */
  setTirar(to: string, n: number) {
    this.tirar.set(to, n)
  }

  addNodo(id: string, isHost: boolean, nombre: string): NodoVirtual {
    const transportId = `t-${id}`
    const game = getGameModule('hipster')!
    const initialGameState = isHost
      ? game.createInitialState([{ id }])
      : { phase: 'lobby', version: 0, gameId: 'hipster' }
    const nv: NodoVirtual = { id, transportId, node: null as any }
    nv.node = new SyncNode({
      salaId: 'abc123',
      selfId: id,
      selfName: nombre,
      isHost,
      hostId: isHost ? id : '',
      juegoId: 'hipster',
      initialGameState,
      getGameModule: (gid: string) => getGameModule(gid),
      send: (msg: any) => this.enviar(id, msg),
      emit: () => {},
      now: () => this.now
    })
    // avisar enlaces: el nuevo ve a los presentes y viceversa
    for (const otro of this.nodos.values()) {
      this.entregaDirecta(otro.transportId, { __join: transportId }, 'hub', 50)
      this.entregaDirecta(transportId, { __join: otro.transportId }, 'hub', 50)
    }
    this.nodos.set(transportId, nv)
    return nv
  }

  private entregaDirecta(toTransport: string, msg: any, fromTransport: string, delay: number) {
    this.cola.push({ at: this.now + delay, to: toTransport, msg, fromTransport })
  }

  private enviar(fromId: string, msg: any) {
    const from = [...this.nodos.values()].find((n) => n.id === fromId)!
    for (const destino of this.nodos.values()) {
      if (destino.transportId === from.transportId) continue
      const pendientes = this.tirar.get(destino.transportId) ?? 0
      if (pendientes > 0) {
        this.tirar.set(destino.transportId, pendientes - 1)
        continue
      }
      const delay = this.retardos.get(this.clave(from.transportId, destino.transportId)) ?? 20
      this.entregaDirecta(destino.transportId, msg, from.transportId, delay)
    }
  }

  /** Avanza el reloj virtual: entrega mensajes y hace tick de 1 s en cada nodo. */
  avanzar(ms: number) {
    const fin = this.now + ms
    while (true) {
      this.cola.sort((a, b) => a.at - b.at)
      const sig = this.cola[0]
      const proximoTick = (Math.floor(this.now / 1000) + 1) * 1000
      if ((!sig || sig.at > fin) && proximoTick > fin) break
      if (sig && sig.at <= Math.min(fin, proximoTick)) {
        this.now = sig.at
        this.cola.shift()
        const nodo = this.nodos.get(sig.to)
        if (!nodo) continue
        if ((sig.msg as any).__join) {
          nodo.node.peerJoined((sig.msg as any).__join)
        } else {
          nodo.node.receive(sig.msg, sig.fromTransport)
        }
      } else {
        this.now = Math.min(fin, proximoTick)
        for (const nodo of this.nodos.values()) nodo.node.tickSecond()
      }
    }
    this.now = fin
  }

  snapshots() {
    return [...this.nodos.values()].map((n) => ({ id: n.id, snap: n.node.snapshot() }))
  }
}

describe.each([2, 5, 10, 15, 20])('sala con %i jugadores', (n) => {
  it('todos convergen a la misma lista de peers y estado', () => {
    const hub = new Hub()
    const host = hub.addNodo('host', true, 'Anfitrión')
    host.node.start()
    hub.avanzar(500)

    // uniones escalonadas; cada invitado tarda en "conectar" y pierde
    // sus primeros mensajes (el caso del 3er/4º móvil de la fiesta)
    for (let i = 2; i <= n; i++) {
      const id = `j${i}`
      const nv = hub.addNodo(id, false, `Jugador ${i}`)
      hub.setTirar(nv.transportId, 4)
      nv.node.start()
      hub.avanzar(700)
    }
    // dejar que heartbeats (2 s) y reintentos sincronicen a todos
    hub.avanzar(15000)

    const snaps = hub.snapshots()
    const ids = snaps.map((s) => s.id).sort()
    for (const { id, snap } of snaps) {
      // cada nodo ve a los N, incluido a sí mismo desde el inicio
      expect(snap.peers.map((p) => p.id).sort(), `peers de ${id}`).toEqual(ids)
      expect(snap.hostId).toBe('host')
      expect(snap.syncedOnce).toBe(true)
      expect(snap.gameState.phase).toBe('lobby')
    }
    // mismo juego en todos
    const versiones = new Set(snaps.map((s) => s.snap.gameState.version))
    expect(versiones.size).toBe(1)
  })

  it('el invitado se ve a sí mismo aunque no llegue ningún mensaje', () => {
    const hub = new Hub()
    hub.addNodo('host', true, 'Anfitrión')
    const invitado = hub.addNodo('solo', false, 'Solo')
    // tirar TODO lo que le llegue: aislamiento total de red
    hub.setTirar(invitado.transportId, 10_000)
    invitado.node.start()
    hub.avanzar(5000)
    const snap = invitado.node.snapshot()
    expect(snap.peers.map((p) => p.id)).toEqual(['solo'])
    expect(snap.syncedOnce).toBe(false)
  })
})
