import { hashQuery } from './signaling'

/**
 * Trackers WebSocket (WebTorrent) para señalización, sin cuentas ni backend.
 * Verificados por sonda real el 2026-09-09: solo `openwebtorrent` retransmite
 * ofertas de forma fiable; `webtorrent.dev` y `ftorrent` conectan y dan censo
 * (redundancia útil entre IPs distintas); `btorrent.xyz`, `webtorrent.io` y
 * `files.fm` están muertos (conexión rechazada / DNS / 403) y se eliminaron.
 * OJO: en todo internet público solo existen ~3 trackers wss (ver lista
 * diaria ngosang/trackerslist: best.txt trae un único wss) — la redundancia
 * real es limitada y la app lo vigila en Room.svelte (línea Señalización).
 * TURN queda fuera: los gratuitos sin cuenta ya no asignan (verificado).
 */
export const TRACKER_URLS: readonly string[] = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.openwebtorrent.com:443/announce',
  'wss://tracker.webtorrent.dev',
  'wss://open.ftorrent.com:443'
]

export const RELAY_REDUNDANCY = 5

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Los trackers de pruebas solo se aceptan desde páginas y servidores locales. */
export function trackerOverrides(): string[] {
  if (!loopbackHosts.has(globalThis.location?.hostname ?? '')) return []
  return [...new Set(hashQuery().getAll('tracker').filter((value) => {
    try {
      const url = new URL(value)
      return loopbackHosts.has(url.hostname) && ['ws:', 'wss:'].includes(url.protocol) &&
        !url.username && !url.password
    } catch {
      return false
    }
  }))]
}

export function trackerUrls(): string[] {
  const overrides = trackerOverrides()
  return overrides.length ? overrides : [...TRACKER_URLS]
}

export const STUN_URLS: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
  'stun:stun.cloudflare.com:3478',
  'stun:openrelay.metered.ca:80'
]

export function buildRtcConfig(extraIceServers: RTCIceServer[] = []): RTCConfiguration {
  return { iceServers: [...STUN_URLS.map((urls) => ({ urls })), ...extraIceServers] }
}

export function buildJoinConfig(appId: string, turnServers: RTCIceServer[] = []): {
  appId: string
  relayUrls: string[]
  relayRedundancy: number
  rtcConfig: RTCConfiguration
} {
  const relayUrls = trackerUrls()
  return {
    appId,
    relayUrls,
    relayRedundancy: Math.min(RELAY_REDUNDANCY, relayUrls.length),
    rtcConfig: buildRtcConfig(turnServers)
  }
}
