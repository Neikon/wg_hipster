import { joinRoom as joinTorrent, getRelaySockets, selfId } from 'trystero/torrent'
import type { Room } from 'trystero'
import { buildJoinConfig, buildRtcConfig } from './transport'

export const transportSelfId = selfId
import type { Estrategia, SupaConf } from './signaling'

export interface TrysteroRoom {
  send: (msg: any, transportPeerId?: string) => void
  get: (cb: (msg:any, peerId:string)=>void) => void
  onPeerJoin: (cb:(id:string)=>void)=>void
  onPeerLeave: (cb:(id:string)=>void)=>void
  leave: () => Promise<void>
}

/**
 * Hook solo para tests e2e: `?lagMs=N&lossPct=P` en el hash simula un móvil
 * lento con WiFi de fiesta (retardo con jitter + pérdida por receptor).
 * Sin esos parámetros, el transporte queda intacto.
 */
function netDegradation(): { lagMs: number; lossPct: number } {
  try {
    if (typeof location !== 'undefined' && typeof location.hash === 'string') {
      const q = new URLSearchParams(location.hash.split('?')[1] || '')
      const lagMs = Math.max(0, parseInt(q.get('lagMs') || '0', 10) || 0)
      const lossPct = Math.min(90, Math.max(0, parseFloat(q.get('lossPct') || '0') || 0))
      if (lagMs > 0 || lossPct > 0) return { lagMs, lossPct }
    }
  } catch {
    // sin location (SSR / tests unitarios en node): sin degradación
  }
  return { lagMs: 0, lossPct: 0 }
}

export interface RelayStatus {
  url: string
  open: boolean
}

/**
 * Estado de los sockets de señalización (trackers). Permite a la UI mostrar
 * "Señalización X/Y" y detectar la sala fantasma: malla de datos viva pero
 * 0 trackers alcanzables (nadie nuevo puede entrar). No toca la red.
 */
export function relayStatus(urls: readonly string[]): RelayStatus[] {
  try {
    const sockets = getRelaySockets() as Record<string, WebSocket | undefined>
    const selected = new Set(urls.map((url) => new URL(url).href))
    return Object.entries(sockets)
      .filter(([url]) => selected.has(url))
      .map(([url, socket]) => ({ url, open: socket?.readyState === WebSocket.OPEN }))
  } catch {
    return []
  }
}

/**
 * Une a la sala con la estrategia indicada. Supabase se importa en diferido
 * para no engordar el bundle de quien usa torrent (defecto).
 */
export async function joinTrystero(
  salaId: string,
  turnServers: RTCIceServer[] = [],
  estrategia: Estrategia = 'torrent',
  supa: SupaConf | null = null
): Promise<TrysteroRoom> {
  let room: Room
  if (estrategia === 'supabase') {
    if (!supa) throw new Error('Falta un proyecto Supabase con clave pública')
    const { joinRoom } = await import('trystero/supabase')
    // Trystero/supabase usa appId como URL del proyecto y salaId como room.
    room = joinRoom({ appId: supa.url, supabaseKey: supa.key, rtcConfig: buildRtcConfig(turnServers) }, salaId)
  } else {
    const config = buildJoinConfig('wg_hipster_v1_' + salaId, turnServers)
    // Trystero torrent strategy usa salaId como roomId
    room = joinTorrent(config, salaId)
  }
  const [rawSend, rawGet] = room.makeAction('msg')
  const send = (msg: any, transportPeerId?: string) => {
    void rawSend(msg, transportPeerId).catch(() => {})
  }
  const { lagMs, lossPct } = netDegradation()
  if (lagMs === 0 && lossPct === 0) {
    return {
      send,
      get: rawGet,
      onPeerJoin: room.onPeerJoin.bind(room),
      onPeerLeave: room.onPeerLeave.bind(room),
      leave: room.leave.bind(room)
    }
  }
  // retardo en envío (jitter 0.5x–1.5x), pérdida por receptor: cada peer
  // pierde mensajes de forma independiente, como en una red real
  const drop = () => lossPct > 0 && Math.random() * 100 < lossPct
  const lagged = (fn: () => void) => {
    if (lagMs > 0) setTimeout(fn, lagMs * (0.5 + Math.random()))
    else fn()
  }
  let onMsg: ((msg: any, peerId: string) => void) | null = null
  rawGet((msg: any, peerId: string) => {
    if (drop()) return
    lagged(() => onMsg?.(msg, peerId))
  })
  return {
    send: (msg, transportPeerId) => lagged(() => send(msg, transportPeerId)),
    get: (cb: (msg: any, peerId: string) => void) => {
      onMsg = cb
    },
    onPeerJoin: room.onPeerJoin.bind(room),
    onPeerLeave: room.onPeerLeave.bind(room),
    leave: room.leave.bind(room)
  }
}
