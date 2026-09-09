import { joinRoom as trysteroJoin, getRelaySockets } from 'trystero/torrent'
import { buildJoinConfig } from './transport'

export interface TrysteroRoom {
  send: (msg: any) => void
  get: (cb: (msg:any, peerId:string)=>void) => void
  onPeerJoin: (cb:(id:string)=>void)=>void
  onPeerLeave: (cb:(id:string)=>void)=>void
  leave: ()=>void
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
export function relayStatus(): RelayStatus[] {
  try {
    const sockets = getRelaySockets() as Record<string, WebSocket | undefined>
    return Object.entries(sockets).map(([url, socket]) => ({ url, open: socket?.readyState === WebSocket.OPEN }))
  } catch {
    return []
  }
}

export function joinTrystero(salaId: string): TrysteroRoom {
  const config = buildJoinConfig('wg_hipster_v1_' + salaId) as any
  // Trystero torrent strategy usa salaId como roomId
  const room: any = (trysteroJoin as any)(config, salaId)
  const [rawSend, rawGet] = room.makeAction('msg')
  const { lagMs, lossPct } = netDegradation()
  if (lagMs === 0 && lossPct === 0) {
    return {
      send: rawSend,
      get: rawGet,
      onPeerJoin: room.onPeerJoin.bind(room),
      onPeerLeave: room.onPeerLeave.bind(room),
      leave: room.leave ? room.leave.bind(room) : () => {}
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
    send: (msg: any) => lagged(() => rawSend(msg)),
    get: (cb: (msg: any, peerId: string) => void) => {
      onMsg = cb
    },
    onPeerJoin: room.onPeerJoin.bind(room),
    onPeerLeave: room.onPeerLeave.bind(room),
    leave: room.leave ? room.leave.bind(room) : () => {}
  }
}
