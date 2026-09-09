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

/**
 * Hook solo para tests e2e: `?tracker=ws://...` (repetible) en el hash de la
 * sala redirige la señalización a trackers locales. Sin ese parámetro, la
 * ruta de producción queda intacta (misma clave relayUrls, mismos defaults).
 */
export function trackerUrls(): string[] {
  try {
    if (typeof location !== 'undefined' && typeof location.hash === 'string') {
      const q = new URLSearchParams(location.hash.split('?')[1] || '')
      const list = q
        .getAll('tracker')
        .map((s) => s.trim())
        .filter(Boolean)
      if (list.length > 0) return list
    }
  } catch {
    // sin location (SSR / tests unitarios en node): defaults de producción
  }
  return [...TRACKER_URLS]
}

export const STUN_URLS: readonly string[] = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:global.stun.twilio.com:3478',
  'stun:stun.cloudflare.com:3478',
  'stun:openrelay.metered.ca:80'
]

export function buildRtcConfig(): RTCConfiguration {
  return { iceServers: STUN_URLS.map((urls) => ({ urls })) }
}

export function buildJoinConfig(appId: string): {
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
    rtcConfig: buildRtcConfig()
  }
}
