import { describe, it, expect, afterEach } from 'vitest'
import { TRACKER_URLS, STUN_URLS, RELAY_REDUNDANCY, buildJoinConfig, buildRtcConfig, trackerUrls } from '../../src/lib/net/transport'

describe('transport', () => {
  afterEach(() => {
    location.hash = '#/'
  })

  it('usa varios trackers wss con redundancia', () => {
    // En internet público solo existen ~3 trackers wss; exigir 2 verificados,
    // no 5 muertos (btorrent.xyz, webtorrent.io y files.fm se podaron el 2026-09-09).
    expect(TRACKER_URLS.length).toBeGreaterThanOrEqual(2)
    for (const u of TRACKER_URLS) expect(u.startsWith('wss://')).toBe(true)
    // sin duplicados
    expect(new Set(TRACKER_URLS).size).toBe(TRACKER_URLS.length)
    expect(RELAY_REDUNDANCY).toBeGreaterThanOrEqual(TRACKER_URLS.length - 1)
  })

  it('trackerUrls acepta override ?tracker= (solo e2e), si no defaults', () => {
    expect(trackerUrls()).toEqual([...TRACKER_URLS])
    location.hash = '#/sala/abc123?tracker=' + encodeURIComponent('ws://127.0.0.1:18923')
    expect(trackerUrls()).toEqual(['ws://127.0.0.1:18923'])
    location.hash =
      '#/sala/abc123?tracker=' + encodeURIComponent('ws://127.0.0.1:1') + '&tracker=' + encodeURIComponent('ws://127.0.0.1:2')
    expect(trackerUrls()).toEqual(['ws://127.0.0.1:1', 'ws://127.0.0.1:2'])
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
    expect(c.relayRedundancy).toBe(Math.min(RELAY_REDUNDANCY, TRACKER_URLS.length))
    expect(c.rtcConfig.iceServers!.length).toBe(STUN_URLS.length)
  })
})
