/**
 * Endurecimiento del transporte P2P (sin cuentas ni backend):
 * - más trackers WebTorrent = más vías para encontrarse (redundancia 5);
 * - más STUN = más NATs superados (los de serie solo traen Google+Twilio).
 * TURN queda fuera: los gratuitos sin cuenta ya no asignan (verificado).
 */
export const TRACKER_URLS: readonly string[] = [
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
  'wss://tracker.openwebtorrent.com:443/announce',
  'wss://tracker.webtorrent.io'
]

export const RELAY_REDUNDANCY = 5

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
  return {
    appId,
    relayUrls: [...TRACKER_URLS],
    relayRedundancy: RELAY_REDUNDANCY,
    rtcConfig: buildRtcConfig()
  }
}
