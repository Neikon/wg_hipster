/**
 * Chequeo activo de red para el modo debug: crea una RTCPeerConnection
 * temporal (NO la de Trystero, que no expone las suyas) solo para reunir
 * candidatos ICE locales y deducir si este dispositivo/red puede hacer P2P.
 *
 * Qué dice cada hallazgo:
 * - host: IPs locales (incl. mDNS ofuscadas). Siempre hay.
 * - srflx: tu IP pública vista por el STUN = el UDP sale y vuelve. Sin esto,
 *   el directo es imposible (NAT simétrica o UDP bloqueado).
 * - relay: solo si hay TURN configurado.
 * - Sin srflx ni relay: veredicto NO_P2P (solo servidor/relay externo).
 *
 * OJO privacidad: el informe incluye tu IP pública (srflx). Solo se genera
 * al pulsar "Probar mi red" y viaja únicamente en el log que TÚ exportes.
 */

export interface VeredictoRed {
  host: string[]
  srflx: string[]
  relay: string[]
  veredicto: 'P2P_OK' | 'SOLO_TURN' | 'NO_P2P'
}

export function clasificarCandidatos(lineas: string[]): VeredictoRed {
  const host: string[] = []
  const srflx: string[] = []
  const relay: string[] = []
  for (const l of lineas) {
    const m = l.match(/candidate:\S+ \d+ (\w+) \d+ (\S+) \d+ typ (\w+)/)
    if (!m) continue
    const [, proto, ip, tipo] = m
    const tag = `${ip}/${proto}`
    if (tipo === 'host' && !host.includes(tag)) host.push(tag)
    else if (tipo === 'srflx' && !srflx.includes(tag)) srflx.push(tag)
    else if (tipo === 'relay' && !relay.includes(tag)) relay.push(tag)
  }
  const veredicto = srflx.length > 0 ? 'P2P_OK' : relay.length > 0 ? 'SOLO_TURN' : 'NO_P2P'
  return { host, srflx, relay, veredicto }
}

/** Reúne candidatos locales durante `ms` y los clasifica. Nunca lanza. */
export async function diagnosticarRed(rtcConfig: RTCConfiguration, ms = 6000): Promise<VeredictoRed> {
  const vacio: VeredictoRed = { host: [], srflx: [], relay: [], veredicto: 'NO_P2P' }
  try {
    if (typeof RTCPeerConnection === 'undefined') return vacio
    const pc = new RTCPeerConnection(rtcConfig)
    const lineas: string[] = []
    try {
      pc.createDataChannel('probe')
      await pc.setLocalDescription(await pc.createOffer())
      await new Promise<void>((resolve) => {
        const fin = setTimeout(resolve, ms)
        pc.onicecandidate = (e) => {
          if (e.candidate) lineas.push(e.candidate.candidate)
        }
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(fin)
            resolve()
          }
        }
      })
    } finally {
      try {
        pc.close()
      } catch {
        // cierre best-effort
      }
    }
    return clasificarCandidatos(lineas)
  } catch {
    return vacio
  }
}
