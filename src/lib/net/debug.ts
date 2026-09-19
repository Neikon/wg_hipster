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
  veces: number
}

const MAX = 1000
/** Ventana para colapsar repeticiones seguidas (×N). */
const COLAPSO_MS = 3000

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

  disable(): void {
    this.enabled = false
  }

  log(cat: DebugCat, msg: string): void {
    if (!this.enabled) return
    const ahora = Date.now() - this.t0
    const ultima = this.entries[this.entries.length - 1]
    if (ultima && ultima.cat === cat && ultima.msg === msg && ahora - ultima.ms < COLAPSO_MS) {
      ultima.veces++
      return
    }
    this.entries.push({ ms: ahora, cat, msg, veces: 1 })
    if (this.entries.length > MAX) this.entries.splice(0, this.entries.length - MAX)
  }

  count(): number {
    return this.entries.length
  }

  tail(n: number): string {
    return this.entries
      .slice(-n)
      .map((e) => `[${fmtMs(e.ms)}] ${e.cat} ${e.msg}${e.veces > 1 ? ` (×${e.veces})` : ''}`)
      .join('\n')
  }

  toText(): string {
    return `# wg_hipster debug log\n# exportado ${new Date().toISOString()}\n${this.tail(this.entries.length)}\n`
  }
}

export const debugLog = new DebugLog()

type ConsoleFn = (...args: any[]) => void

/**
 * Captura console.warn/error al log (aquí avisa Trystero de rechazos del
 * tracker, p. ej. "torrent tracker failure"). Colapsa repeticiones seguidas
 * (×N) para no inundar. Solo registra si el log está habilitado.
 * Devuelve función para desinstalar.
 */
export function installConsoleCapture(): () => void {
  let origWarn: ConsoleFn | null = null
  let origError: ConsoleFn | null = null
  try {
    if (typeof console === 'undefined') return () => {}
    origWarn = console.warn.bind(console)
    origError = console.error.bind(console)
  } catch {
    return () => {}
  }
  const fmt = (args: any[]): string => {
    try {
      return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' ').slice(0, 300)
    } catch {
      return '(no serializable)'
    }
  }
  // llamadas reales preservadas para no romper DevTools
  console.warn = (...args: any[]) => {
    try {
      origWarn!(...args)
    } catch {
      // mostrar por consola es best-effort
    }
    debugLog.log('red', `console.warn: ${fmt(args)}`)
  }
  console.error = (...args: any[]) => {
    try {
      origError!(...args)
    } catch {
      // mostrar por consola es best-effort
    }
    debugLog.log('red', `console.error: ${fmt(args)}`)
  }
  return () => {
    try {
      if (origWarn) console.warn = origWarn
      if (origError) console.error = origError
    } catch {
      // restaurar es best-effort
    }
  }
}

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
