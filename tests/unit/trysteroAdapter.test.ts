import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinTrystero, relayStatus } from '../../src/lib/net/trysteroAdapter'

const { torrent, supabase, send, sockets } = vi.hoisted(() => {
  const send = vi.fn().mockResolvedValue([])
  const room = { makeAction: () => [send, vi.fn()], onPeerJoin: vi.fn(), onPeerLeave: vi.fn(), leave: vi.fn() }
  return { torrent: vi.fn(() => room), supabase: vi.fn(() => room), send, sockets: vi.fn() }
})
vi.mock('trystero/torrent', () => ({ joinRoom: torrent, getRelaySockets: sockets, selfId: 'tracker-self-id' }))
vi.mock('trystero/supabase', () => ({ joinRoom: supabase }))

describe('adaptador Trystero', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    location.hash = '#/'
  })

  it('usa TURN en torrent y Supabase', async () => {
    const turn = { urls: 'turn:relay.example.test:3478', username: 'tester', credential: 'test-password' }
    await joinTrystero('abc123', [turn])
    await joinTrystero('abc123', [turn], 'supabase', { url: 'https://example.supabase.co', key: 'sb_publishable_test' })
    for (const join of [torrent, supabase]) {
      expect(join).toHaveBeenCalledWith(expect.objectContaining({
        rtcConfig: { iceServers: expect.arrayContaining([turn]) }
      }), 'abc123')
    }
  })

  it('conserva el destino al enviar con retraso simulado', async () => {
    vi.useFakeTimers()
    location.hash = '#/sala/abc123?lagMs=100'
    const room = await joinTrystero('abc123')
    const message = { t: 'roomFull' }
    room.send(message, 'guest')
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledWith(message, 'guest')
  })

  it('reconoce la URL de tracker normalizada por el WebSocket', () => {
    const local = 'ws://127.0.0.1:19000'
    sockets.mockReturnValue({
      [local + '/']: { readyState: WebSocket.OPEN },
      'wss://otro.example.test/': { readyState: WebSocket.OPEN }
    })
    expect(relayStatus([local])).toEqual([{ url: local + '/', open: true }])
  })
})
