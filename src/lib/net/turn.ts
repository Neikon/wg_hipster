/**
 * TURN para datos móviles con NAT simétrica (en la calle el UDP directo no
 * cruza aunque haya 4/4 trackers). Sin TURN no hay fiesta con datos.
 *
 * Sin cuentas nuestras: cada jugador usa su propio endpoint de credenciales
 * (Metered OpenRelay, 20 GB/mes gratis) guardado en este navegador. Flujo:
 * 1. Crear cuenta gratis en https://dashboard.metered.ca y una app.
 * 2. Copiar la URL de credenciales TURN (https://<app>.metered.live/api/v1/turn/credentials?apiKey=...).
 * 3. Pegarla en el lobby (ajustes de conexión) o como `?turnApi=<url>`.
 *
 * Diseño sin bloqueos: la lectura en el join es síncrona (caché) y el
 * refresco desde la API es en segundo plano para la próxima entrada
 * (el rejoin automático también lo recoge). Sin TURN configurado, todo
 * funciona como antes (solo STUN).
 */

export const TURN_API_KEY = 'wg_hipster:turnApi'
export const TURN_CACHE_KEY = 'wg_hipster:turnServers'
const TURN_TIMEOUT_MS = 4000

export interface TurnServer {
  urls: string | string[]
  username?: string
  credential?: string
}

function esTurnValido(s: any): s is TurnServer {
  if (!s || typeof s !== 'object') return false
  const urls = (s as any).urls
  const urlsOk =
    (typeof urls === 'string' && urls.length > 0) ||
    (Array.isArray(urls) && urls.length > 0 && urls.every((u) => typeof u === 'string'))
  if (!urlsOk) return false
  const { username, credential } = s as any
  if (username !== undefined && typeof username !== 'string') return false
  if (credential !== undefined && typeof credential !== 'string' && typeof credential !== 'number') return false
  return true
}

function parseTurnServers(raw: string): TurnServer[] {
  try {
    const v = JSON.parse(raw)
    const list = Array.isArray(v) ? v : (v as any)?.iceServers
    if (!Array.isArray(list)) return []
    // Normalizar a RTCIceServer (credencial siempre string).
    const out: TurnServer[] = []
    for (const s of list) {
      if (!esTurnValido(s)) continue
      out.push({
        urls: s.urls,
        ...(typeof s.username === 'string' ? { username: s.username } : {}),
        ...(s.credential === undefined ? {} : { credential: String(s.credential) })
      })
    }
    return out
  } catch {
    return []
  }
}

function hashQuery(): URLSearchParams {
  try {
    if (typeof location !== 'undefined' && typeof location.hash === 'string') {
      return new URLSearchParams(location.hash.split('?')[1] || '')
    }
  } catch {
    // sin location (SSR / node): query vacío
  }
  return new URLSearchParams()
}

function leerLocalStorage(clave: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(clave)
  } catch {
    // almacenamiento no disponible
  }
  return null
}

/**
 * Servidores TURN para el join (síncrono, nunca bloquea ni falla).
 * Orden: `?turn=` (JSON, tests/override) → caché local → ninguno.
 */
export function readTurnServers(): TurnServer[] {
  const porQuery = hashQuery().get('turn')
  if (porQuery) {
    const list = parseTurnServers(porQuery)
    if (list.length > 0) return list
  }
  const cache = leerLocalStorage(TURN_CACHE_KEY)
  if (cache) return parseTurnServers(cache)
  return []
}

/** URL del endpoint de credenciales (query `?turnApi=` la guarda). */
export function turnApiUrl(): string | null {
  const porQuery = hashQuery().get('turnApi')
  if (porQuery && porQuery.startsWith('https://')) return porQuery
  const guardada = leerLocalStorage(TURN_API_KEY)
  if (guardada && guardada.startsWith('https://')) return guardada
  return null
}

export function guardarTurnApi(url: string): boolean {
  const v = url.trim()
  if (!v.startsWith('https://')) return false
  try {
    localStorage.setItem(TURN_API_KEY, v)
    return true
  } catch {
    return false
  }
}

/**
 * Refresca la caché desde el endpoint (segundo plano; no lanzar sin URLs).
 * Las credenciales TURN caducan: se refresca en cada entrada a sala para que
 * el próximo join/rejoin las tenga frescas.
 */
export async function refreshTurnServers(): Promise<TurnServer[]> {
  const api = turnApiUrl()
  if (!api) return []
  // ?turnApi= en el hash persiste la URL para este navegador
  try {
    if (typeof localStorage !== 'undefined' && hashQuery().get('turnApi')) {
      localStorage.setItem(TURN_API_KEY, api)
    }
  } catch {
    // sin almacenamiento: se usa la respuesta una sola vez (no se guarda)
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TURN_TIMEOUT_MS)
  try {
    const res = await fetch(api, { signal: ctrl.signal })
    if (!res.ok) return []
    const list = parseTurnServers(await res.text())
    if (list.length === 0) return []
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(TURN_CACHE_KEY, JSON.stringify(list))
    } catch {
      // caché no disponible: se devuelve igual para este join
    }
    return list
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}
