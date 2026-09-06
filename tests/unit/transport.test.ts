import { describe, it, expect } from 'vitest'
import { TRACKER_URLS, STUN_URLS, RELAY_REDUNDANCY, buildJoinConfig, buildRtcConfig } from '../../src/lib/net/transport'

describe('transport', () => {
  it('usa varios trackers wss con redundancia', () => {
    expect(TRACKER_URLS.length).toBeGreaterThanOrEqual(5)
    for (const u of TRACKER_URLS) expect(u.startsWith('wss://')).toBe(true)
    // sin duplicados
    expect(new Set(TRACKER_URLS).size).toBe(TRACKER_URLS.length)
    expect(RELAY_REDUNDANCY).toBeGreaterThanOrEqual(TRACKER_URLS.length - 1)
  })

  it('rtcConfig con varios STUN y sin TURN de juguete', () => {
    const rtc = buildRtcConfig()
    const urls = rtc.iceServers!.flatMap((s: any) => (Array.isArray(s.urls) ? s.urls : [s.urls]))
    expect(urls.length).toBeGreaterThanOrEqual(4)
    for (const u of urls) expect(u.startsWith('stun:')).toBe(true)
  })

  it('joinConfig conserva appId por sala', () => {
    const c = buildJoinConfig('wg_hipster_v1_abc123')
    expect(c.appId).toBe('wg_hipster_v1_abc123')
    expect(c.relayUrls).toEqual([...TRACKER_URLS])
    expect(c.relayRedundancy).toBe(RELAY_REDUNDANCY)
    expect(c.rtcConfig.iceServers!.length).toBe(STUN_URLS.length)
  })
})
