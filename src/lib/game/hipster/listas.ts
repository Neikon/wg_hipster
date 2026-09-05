import type { HipsterTrack } from './types'
import { TRACKS } from './tracks'

export type ListaFuente = 'deezer-chart' | 'deezer-playlist' | 'fixture'

export interface ListaRef {
  id: string
  nombre: string
  fuente: ListaFuente
  /** genre_id para deezer-chart, playlist_id para deezer-playlist */
  ref: string
}

export const LISTAS: readonly ListaRef[] = [
  { id: 'top-global', nombre: 'Top global', fuente: 'deezer-chart', ref: '0' },
  { id: 'top-espana', nombre: 'Top España', fuente: 'deezer-playlist', ref: '1116190041' },
  { id: 'top-japon', nombre: 'Top Japón', fuente: 'deezer-playlist', ref: '1362508955' },
  { id: 'top-rock', nombre: 'Top Rock', fuente: 'deezer-chart', ref: '152' },
  { id: 'top-pop', nombre: 'Top Pop', fuente: 'deezer-chart', ref: '132' },
  { id: 'top-reggaeton', nombre: 'Top Reggaeton', fuente: 'deezer-chart', ref: '122' },
  { id: 'fiesta-clasicos', nombre: 'Clásicos (sin conexión)', fuente: 'fixture', ref: '' }
]

export function getLista(id: string): ListaRef | null {
  return LISTAS.find((l) => l.id === id) ?? null
}

interface Crudo {
  trackId: number
  titulo: string
  artista: string
  album: string
  previewUrl: string
  artworkUrl: string
}

function mapDeezer(r: any): Crudo | null {
  if (!r || typeof r.title !== 'string' || !r.artist?.name) return null
  return {
    trackId: Number(r.id) || 0,
    titulo: r.title,
    artista: r.artist.name,
    album: r.album?.title ?? '',
    previewUrl: typeof r.preview === 'string' ? r.preview : '',
    artworkUrl: r.album?.cover_medium ?? r.artist?.picture_medium ?? ''
  }
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<any> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function fetchConReintentos(url: string, intentos = 2): Promise<any> {
  let last: unknown = null
  for (let i = 0; i <= intentos; i++) {
    try {
      return await fetchJson(url)
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw last
}

/** Descarga los items crudos de una lista (sin enriquecer). */
export async function fetchLista(ref: ListaRef): Promise<Crudo[]> {
  if (ref.fuente === 'fixture') {
    return TRACKS.map((t) => ({ ...t }))
  }
  if (ref.fuente === 'deezer-chart') {
    const d = await fetchConReintentos(`https://api.deezer.com/chart/${ref.ref}/tracks?limit=100`)
    return (d?.data ?? []).map(mapDeezer).filter(Boolean) as Crudo[]
  }
  // deezer-playlist: paginar hasta 200
  const out: Crudo[] = []
  let next: string | null = `https://api.deezer.com/playlist/${ref.ref}/tracks?limit=100`
  while (next && out.length < 200) {
    const d: any = await fetchConReintentos(next)
    for (const r of d?.data ?? []) {
      const m = mapDeezer(r)
      if (m) out.push(m)
    }
    next = typeof d?.next === 'string' ? d.next : null
  }
  return out
}

function mismoArtista(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const na = n(a)
  const nb = n(b)
  return na.includes(nb) || nb.includes(na)
}

/**
 * Rescate: busca el tema en Deezer para conseguir su preview cuando el item
 * original no trae audio (p. ej. entradas RSS) o el clip está vacío.
 */
export async function rescatarPreview(c: Crudo): Promise<Crudo | null> {
  try {
    const q = encodeURIComponent(`${c.titulo} ${c.artista}`)
    const d = await fetchConReintentos(`https://api.deezer.com/search?q=${q}&limit=5`, 1)
    for (const r of d?.data ?? []) {
      const m = mapDeezer(r)
      if (m?.previewUrl && mismoArtista(m.artista, c.artista)) return m
    }
    for (const r of d?.data ?? []) {
      const m = mapDeezer(r)
      if (m?.previewUrl) return m
    }
  } catch {
    // sin red o rate-limit: se descarta el tema
  }
  return null
}

function esCompleto(c: Crudo): c is Crudo & { previewUrl: string } {
  return !!c.previewUrl && !!c.titulo && !!c.artista
}

/** Concurrencia limitada para no saturar el rate-limit. */
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = new Array(Math.min(n, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export interface PartidaLista {
  tracks: HipsterTrack[]
  descartados: number
}

const CACHE_MS = 10 * 60 * 1000

function leerCache(listaId: string): Crudo[] | null {
  try {
    const raw = sessionStorage.getItem(`hipster:lista:${listaId}`)
    if (!raw) return null
    const { at, items } = JSON.parse(raw)
    if (Date.now() - at > CACHE_MS) return null
    return items
  } catch {
    return null
  }
}

function guardarCache(listaId: string, items: Crudo[]): void {
  try {
    sessionStorage.setItem(`hipster:lista:${listaId}`, JSON.stringify({ at: Date.now(), items }))
  } catch {
    // almacenamiento lleno o no disponible: seguir sin caché
  }
}

/**
 * El host prepara rondas completas: descarga la lista, rescata previews
 * ausentes, descarta incompletos, baraja y corta a numRondas.
 * Garantiza tracks 100 % reproducibles o lanza error.
 */
export async function prepararPartida(listaId: string, numRondas: number): Promise<PartidaLista> {
  const ref = getLista(listaId)
  if (!ref) throw new Error('Lista desconocida')
  const n = Math.max(4, Math.min(30, Math.trunc(numRondas) || 5))

  let crudos = leerCache(ref.id)
  if (!crudos) {
    crudos = await fetchLista(ref)
    guardarCache(ref.id, crudos)
  }

  const completos = await mapLimit(crudos, 5, async (c) => {
    if (esCompleto(c)) return c
    const r = await rescatarPreview(c)
    return r && esCompleto(r) ? r : null
  })
  const validos = completos.filter(Boolean) as Crudo[]
  const descartados = crudos.length - validos.length
  if (validos.length < 4) throw new Error(`Lista insuficiente: solo ${validos.length} temas con audio`)

  // barajar y cortar
  const pool = [...validos]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const tracks: HipsterTrack[] = pool.slice(0, Math.min(n, pool.length)).map((c) => ({
    trackId: c.trackId,
    titulo: c.titulo,
    artista: c.artista,
    album: c.album,
    previewUrl: c.previewUrl,
    artworkUrl: c.artworkUrl
  }))
  return { tracks, descartados }
}
