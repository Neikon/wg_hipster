/**
 * Estrategia de señalización P2P (rendezvous: cómo se encuentran los peers).
 *
 * - `torrent` (defecto): trackers públicos BitTorrent. Sin cuentas, pero con
 *   entradas que caducan (~120 s) y re-anuncios al mismo ritmo: dos peers con
 *   entradas escalonadas pueden no coincidir nunca (sala fantasma de
 *   señalización aunque todo lo demás funcione).
 * - `supabase`: Supabase Realtime (broadcast). Los miembros re-anuncian su
 *   presencia cada ~5 s, así un tardío siempre encuentra a alguien en
 *   segundos. Requiere UN proyecto para todo el mundo (gratis): su URL y su
 *   clave publicable (`sb_publishable_…`, diseñada para ir en el cliente;
 *   la `anon` legacy también vale pero se jubila a finales de 2026).
 *
 * Selección: `?net=torrent|supabase` → localStorage `wg_hipster:net` →
 * defecto `torrent`. Config Supabase: `?supaUrl=&supaKey=` (se guardan) o
 * localStorage. Sin config Supabase se cae a torrent con aviso.
 */

export type Estrategia = 'torrent' | 'supabase'

export const NET_KEY = 'wg_hipster:net'
export const SUPA_URL_KEY = 'wg_hipster:supaUrl'
export const SUPA_KEY_KEY = 'wg_hipster:supaKey'

export interface SupaConf {
  url: string
  key: string
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

function leerLS(clave: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(clave)
  } catch {
    // almacenamiento no disponible
  }
  return null
}

function guardarLS(clave: string, valor: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(clave, valor)
    return true
  } catch {
    return false
  }
}

export function signalingStrategy(): Estrategia {
  const q = hashQuery().get('net')
  if (q === 'torrent' || q === 'supabase') return q
  const guardada = leerLS(NET_KEY)
  if (guardada === 'torrent' || guardada === 'supabase') return guardada
  return 'torrent'
}

export function guardarEstrategia(e: Estrategia): boolean {
  return guardarLS(NET_KEY, e)
}

/** Config Supabase (`?supaUrl=&supaKey=` la persisten). null si incompleta. */
export function supaConf(): SupaConf | null {
  const q = hashQuery()
  const qUrl = q.get('supaUrl')
  const qKey = q.get('supaKey')
  if (qUrl && qKey) {
    guardarLS(SUPA_URL_KEY, qUrl)
    guardarLS(SUPA_KEY_KEY, qKey)
    return { url: qUrl, key: qKey }
  }
  const url = leerLS(SUPA_URL_KEY)
  const key = leerLS(SUPA_KEY_KEY)
  if (url && key && url.startsWith('https://')) return { url, key }
  // la query sola sin https también vale si venía completa (tests locales)
  if (qUrl && qKey) return { url: qUrl, key: qKey }
  return null
}

export function guardarSupa(url: string, key: string): boolean {
  const u = url.trim()
  const k = key.trim()
  if (!u.startsWith('https://') || k.length < 10) return false
  return guardarLS(SUPA_URL_KEY, u) && guardarLS(SUPA_KEY_KEY, k)
}
