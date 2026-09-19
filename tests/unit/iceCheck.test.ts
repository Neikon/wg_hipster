import { describe, it, expect } from 'vitest'
import { clasificarCandidatos } from '../../src/lib/net/iceCheck'

const HOST = 'candidate:0 1 udp 2122260223 192.168.1.20 55555 typ host'
const SRFLX = 'candidate:1 1 udp 1685987071 85.10.20.30 55555 typ srflx raddr 192.168.1.20 rport 55555'
const RELAY = 'candidate:2 1 udp 41819902 10.0.0.1 60000 typ relay raddr 85.10.20.30 rport 55555'

describe('iceCheck', () => {
  it('P2P_OK con srflx', () => {
    const v = clasificarCandidatos([HOST, SRFLX])
    expect(v.veredicto).toBe('P2P_OK')
    expect(v.srflx).toEqual(['85.10.20.30/udp'])
    expect(v.host).toEqual(['192.168.1.20/udp'])
  })
  it('SOLO_TURN con relay pero sin srflx', () => {
    expect(clasificarCandidatos([HOST, RELAY]).veredicto).toBe('SOLO_TURN')
  })
  it('NO_P2P solo con host (UDP bloqueado o NAT dura)', () => {
    const v = clasificarCandidatos([HOST])
    expect(v.veredicto).toBe('NO_P2P')
    expect(v.relay).toEqual([])
  })
  it('ignora líneas raras y no duplica', () => {
    const v = clasificarCandidatos([HOST, HOST, 'basura', SRFLX])
    expect(v.host).toHaveLength(1)
    expect(v.veredicto).toBe('P2P_OK')
  })
})
