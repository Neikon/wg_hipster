/**
 * Registro de depuración (`?debug=1` en el hash de la sala).
 *
 * Guarda en memoria (anillo, 1000 entradas) todo lo observable sin abrir
 * Trystero: mensajes del protocolo (tipos + tamaño), eventos de peers,
 * transiciones de sockets de trackers, reintentos/rejoins/recargas y syncs.
 * El host ve hellos y uniones; el invitado, sus intentos y fallos. Con el id
 * de sala en la cabecera se correlacionan ambos lados.
 *
 * Límite honesto: los pares ICE (IPs/candidatos) NO son visibles — Trystero
 * no expone sus RTCPeerConnection. El log cubre señalización + protocolo.
 */

export type DebugCat = 'red' | 'proto' | 'sala' | 'sys'

interface Entry {
  ms: number
  cat: DebugCat
  msg: string
}

const MAX = 1000

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

class DebugLog {
  enabled = false
  private entries: Entry[] = []
  private t0 = Date.now()

  enable(info: Record<string, string>): void {
    this.entries = []
    this.t0 = Date.now()
    this.enabled = true
    this.log('sys', `log iniciado ${JSON.stringify(info)}`)
  }

  log(cat: DebugCat, msg: string): void {
    if (!this.enabled) return
    this.entries.push({ ms: Date.now() - this.t0, cat, msg })
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX)
  }

  count(): number {
    return this.entries.length
  }

  tail(n: number): string {
    return this.entries
      .slice(-n)
      .map((e) => `[${fmtMs(e.ms)}] ${e.cat} ${e.msg}`)
      .join('\n')
  }

  toText(): string {
    return `# wg_hipster debug log\n# exportado ${new Date().toISOString()}\n${this.tail(this.entries.length)}\n`
  }
}

export const debugLog = new DebugLog()

/** Descarga el texto como fichero (solo navegador). */
export function downloadText(filename: string, text: string): boolean {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      try {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {
        // limpieza best-effort
      }
    }, 1000)
    return true
  } catch {
    return false
  }
}
