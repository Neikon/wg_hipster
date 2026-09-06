import { describe, it, expect, vi } from 'vitest'
import { SyncNode } from '../../src/lib/net/syncEngine'
import type { SyncEvent } from '../../src/lib/net/syncEngine'

function makeNode(isHost: boolean, onSend: (m: any) => void, events: SyncEvent[]) {
  const id = isHost ? 'host' : 'guest'
  return new SyncNode({
    salaId: 'abc123',
    selfId: id,
    selfName: id,
    isHost,
    hostId: isHost ? id : '',
    juegoId: 'hipster',
    initialGameState: { phase: 'lobby', version: 0, gameId: 'hipster' },
    getGameModule: () => null,
    send: onSend,
    emit: (e) => events.push(e)
  })
}

describe('robustez sync', () => {
  it('repite el hello a los 2 s (eco contra pérdida)', () => {
    const enviados: any[] = []
    const node = makeNode(false, (m) => enviados.push(m), [])
    node.peerJoined('t-otro')
    expect(enviados.filter((m) => m.t === 'hello')).toHaveLength(1)
    node.tickSecond()
    expect(enviados.filter((m) => m.t === 'hello')).toHaveLength(1)
    node.tickSecond()
    const hellos = enviados.filter((m) => m.t === 'hello')
    expect(hellos).toHaveLength(2)
    expect(hellos[0]).toEqual(hellos[1])
  })

  it('emite synced una sola vez al primer stateSync', () => {
    const enviados: any[] = []
    const events: SyncEvent[] = []
    const node = makeNode(false, (m) => enviados.push(m), events)
    const sync = {
      t: 'stateSync',
      juegoId: 'hipster',
      fullState: { phase: 'lobby', version: 1, gameId: 'hipster' },
      version: 1,
      hostId: 'host',
      peers: [{ id: 'host', name: 'H', joinTime: 1 }],
      joinOrder: ['host']
    }
    node.receive(sync, 't-host')
    node.receive(sync, 't-host')
    expect(events.filter((e) => e.t === 'synced')).toHaveLength(1)
    expect(node.snapshot().syncedOnce).toBe(true)
  })

  it('tras perder hellos, el eco permite al host registrar al invitado', () => {
    const alHost: any[] = []
    const hostEvents: SyncEvent[] = []
    const host = makeNode(true, (m) => alHost.push(m), hostEvents)
    const guestEnviados: any[] = []
    // guest: el primer hello se pierde, el eco (tick+2) llega al host
    const guest = makeNode(false, (m) => guestEnviados.push(m), [])
    guest.peerJoined('t-host')
    const [perdido, ...resto] = guestEnviados
    expect(perdido.t).toBe('hello')
    // solo el eco llega al host (simula pérdida del primero)
    guest.tickSecond()
    guest.tickSecond()
    const ecos = guestEnviados.filter((m) => m.t === 'hello')
    expect(ecos).toHaveLength(2)
    const eco = ecos[1]
    host.receive(eco, 't-guest')
    expect(host.snapshot().peers.map((p) => p.id).sort()).toEqual(['guest', 'host'])
    void resto
  })
})
