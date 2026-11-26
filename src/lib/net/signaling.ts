export type Estrategia = 'torrent' | 'supabase'

export const NET_KEY = 'wg_hipster:net'
export const SUPA_URL_KEY = 'wg_hipster:supaUrl'
export const SUPA_KEY_KEY = 'wg_hipster:supaKey'

export interface SupaConf {
  url: string
  key: string
}

export function hashQuery(hash = globalThis.location?.hash ?? ''): URLSearchParams {
  const start = hash.indexOf('?')
  return new URLSearchParams(start < 0 ? '' : hash.slice(start + 1))
}

function leerLS(clave: string): string | null {
  try {
    return localStorage.getItem(clave)
  } catch {
    return null
  }
}

function guardarLS(clave: string, valor: string): boolean {
  try {
    localStorage.setItem(clave, valor)
    return true
  } catch {
    return false
  }
}

function esClavePublica(key: string): boolean {
  if (/^sb_publishable_[\w-]+$/.test(key)) return true
  const partes = key.split('.')
  if (partes.length !== 3 || !partes.every((p) => /^[\w-]+$/.test(p))) return false
  try {
    const payload = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))?.role === 'anon'
  } catch {
    return false
  }
}

function validarSupa(url: string | null, key: string | null): SupaConf | null {
  if (!url || !key) return null
  try {
    const proyecto = new URL(url.trim())
    if (proyecto.protocol !== 'https:' || proyecto.username || proyecto.password ||
        proyecto.pathname !== '/' || proyecto.search || proyecto.hash) return null
    const publica = key.trim()
    return esClavePublica(publica) ? { url: proyecto.origin, key: publica } : null
  } catch {
    return null
  }
}

export function signalingStrategy(): Estrategia {
  const q = hashQuery().get('net')
  if (q === 'torrent' || q === 'supabase') return q
  return leerLS(NET_KEY) === 'supabase' && supaConf() ? 'supabase' : 'torrent'
}

export function guardarEstrategia(e: Estrategia): boolean {
  return guardarLS(NET_KEY, e)
}

/** El enlace configura esta sala sin cambiar las preferencias para otras salas. */
export function supaConf(): SupaConf | null {
  const q = hashQuery()
  if (q.has('supaUrl') || q.has('supaKey')) return validarSupa(q.get('supaUrl'), q.get('supaKey'))
  return validarSupa(leerLS(SUPA_URL_KEY), leerLS(SUPA_KEY_KEY))
}

export function guardarSupa(url: string, key: string): boolean {
  const config = validarSupa(url, key)
  return !!config && guardarLS(SUPA_URL_KEY, config.url) && guardarLS(SUPA_KEY_KEY, config.key)
}

export function signalingParams(estrategia: Estrategia, supa: SupaConf | null): URLSearchParams {
  const q = new URLSearchParams({ net: estrategia })
  const config = estrategia === 'supabase' && supa ? validarSupa(supa.url, supa.key) : null
  if (config) {
    q.set('supaUrl', config.url)
    q.set('supaKey', config.key)
  }
  return q
}

export const MAX_HARD_RELOADS = 2

export function guestRecovery(totalMs: number, attemptMs: number, reloads: number, sinTrackers: boolean) {
  if (totalMs >= 30_000) return reloads < MAX_HARD_RELOADS ? 'reload' : 'failed'
  if (attemptMs >= (sinTrackers ? 5_000 : 12_000)) return 'retry'
  return 'wait'
}
