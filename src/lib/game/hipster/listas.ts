import type { HipsterTrack } from './types'
import { TRACKS } from './tracks'
import { mostrarAlbum } from './tracks'

export type ListaFuente = 'itunes-rss' | 'fixture'

export interface ListaRef {
  id: string
  nombre: string
  fuente: ListaFuente
  /** país del chart (es, us, jp…) */
  cc: string
  /** género Apple (21 rock, 14 pop, 12 latino…) o vacío para general */
  genre: string
}

// Apple expone el catálogo al navegador como JSON.
export const LISTAS: readonly ListaRef[] = [
  { id: 'top-global', nombre: 'Top global', fuente: 'itunes-rss', cc: 'us', genre: '' },
  { id: 'top-espana', nombre: 'Top España', fuente: 'itunes-rss', cc: 'es', genre: '' },
  { id: 'top-japon', nombre: 'Top Japón', fuente: 'itunes-rss', cc: 'jp', genre: '' },
  { id: 'top-rock', nombre: 'Top Rock', fuente: 'itunes-rss', cc: 'us', genre: '21' },
  { id: 'top-pop', nombre: 'Top Pop', fuente: 'itunes-rss', cc: 'us', genre: '14' },
  { id: 'top-reggaeton', nombre: 'Top Reggaeton', fuente: 'itunes-rss', cc: 'us', genre: '12' }
]

// Lista inicial de cinco clips, sin consultar el catálogo.
export const LISTA_FALLBACK = 'fiesta-clasicos'

export function getLista(id: string): ListaRef | null {
  if (id === LISTA_FALLBACK) {
    return { id: LISTA_FALLBACK, nombre: 'Clásicos', fuente: 'fixture', cc: '', genre: '' }
  }
  return LISTAS.find((l) => l.id === id) ?? null
}

interface Crudo {
  trackId: number
  titulo: string
  artista: string
  album: string
  previewUrl: string
  artworkUrl: string
  anio: number | null
}

function artworkGrande(url: string): string {
  return url.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg')
}

function anioDe(fecha: unknown): number | null {
  if (typeof fecha !== 'string') return null
  const y = Number(fecha.slice(0, 4))
  return Number.isInteger(y) && y >= 1900 && y <= 2100 ? y : null
}

function mapLookup(r: any): Crudo | null {
  if (!r || typeof r.trackName !== 'string' || typeof r.artistName !== 'string') return null
  const titulo = r.trackName
  let album = r.collectionName ?? ''
  // los singles traen el propio título como álbum: no aporta nada y regalaría la respuesta
  if (!mostrarAlbum({ titulo, album })) album = ''
  return {
    trackId: Number(r.trackId) || 0,
    titulo,
    artista: r.artistName,
    album,
    previewUrl: typeof r.previewUrl === 'string' ? r.previewUrl : '',
    artworkUrl: typeof r.artworkUrl100 === 'string' ? artworkGrande(r.artworkUrl100) : '',
    anio: anioDe(r.releaseDate)
  }
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<any> {
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
  let last: unknown = new Error('sin respuesta')
  for (let i = 0; i <= intentos; i++) {
    try {
      return await fetchJson(url)
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw last
}

interface EntradaRSS {
  trackId: number
  titulo: string
  artista: string
}

/** Top del RSS de Apple (nombres + id). */
export async function fetchChart(ref: ListaRef, limit = 30): Promise<EntradaRSS[]> {
  const genre = ref.genre ? `/genre=${ref.genre}` : ''
  const d = await fetchConReintentos(`https://itunes.apple.com/${ref.cc}/rss/topsongs/limit=${limit}${genre}/json`)
  const entry = d?.feed?.entry
  const list = Array.isArray(entry) ? entry : entry ? [entry] : []
  const out: EntradaRSS[] = []
  for (const e of list) {
    const trackId = Number(e?.id?.attributes?.['im:id'])
    const titulo = e?.['im:name']?.label
    const artista = e?.['im:artist']?.label
    if (Number.isFinite(trackId) && trackId > 0 && titulo && artista) out.push({ trackId, titulo, artista })
  }
  return out
}

/** Enriquece una entrada con preview + carátula vía lookup (con rescate por búsqueda). */
export async function enriquecer(e: EntradaRSS, cc: string): Promise<Crudo | null> {
  try {
    const d = await fetchConReintentos(
      `https://itunes.apple.com/lookup?id=${e.trackId}&country=${cc.toUpperCase()}&entity=song`,
      1
    )
    const m = mapLookup(d?.results?.[0])
    if (m?.previewUrl) return m
  } catch {
    // sigue al rescate por búsqueda
  }
  try {
    const q = encodeURIComponent(`${e.titulo} ${e.artista}`)
    const d = await fetchConReintentos(
      `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=3&country=${cc.toUpperCase()}`,
      1
    )
    for (const r of d?.results ?? []) {
      const m = mapLookup(r)
      if (m?.previewUrl) return m
    }
  } catch {
    // sin red: se descarta el tema
  }
  return null
}

/** Concurrencia limitada para respetar ~20 req/min de iTunes. */
async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = new Array(Math.min(n, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
      // pausa entre oleadas para no saturar el límite
      await new Promise((r) => setTimeout(r, 250))
    }
  })
  await Promise.all(workers)
  return out
}

export interface PartidaLista {
  /** Rondas elegidas (corte de N). */
  tracks: HipsterTrack[]
  /** Lista original completa: de aquí salen los distractores. */
  pool: HipsterTrack[]
  descartados: number
}

const CACHE_MS = 10 * 60 * 1000

interface CacheLista {
  at: number
  items: Crudo[]
  pendientes?: EntradaRSS[]
}

function leerCache(listaId: string): CacheLista | null {
  try {
    const raw = sessionStorage.getItem(`hipster:lista:${listaId}`)
    if (!raw) return null
    const cache: CacheLista = JSON.parse(raw)
    if (Date.now() - cache.at > CACHE_MS || !Array.isArray(cache.items)) return null
    return cache
  } catch {
    return null
  }
}

function guardarCache(listaId: string, items: Crudo[], pendientes?: EntradaRSS[]): void {
  try {
    sessionStorage.setItem(`hipster:lista:${listaId}`, JSON.stringify({ at: Date.now(), items, pendientes }))
  } catch {
    // almacenamiento lleno o no disponible: seguir sin caché
  }
}

/**
 * El host prepara rondas completas: descarga el chart, enriquece con lookup
 * hasta tener numRondas temas con audio (o agota el chart), baraja y corta.
 * Con requireAnio (modo año) descarta además los temas sin año.
 * Garantiza tracks 100 % reproducibles o lanza error explicando el paso.
 */
export async function prepararPartida(
  listaId: string,
  numRondas: number,
  opts: { requireAnio?: boolean } = {}
): Promise<PartidaLista> {
  const ref = getLista(listaId)
  if (!ref) throw new Error('Lista desconocida')
  const n = Math.max(4, Math.min(30, Math.trunc(numRondas) || 5))

  if (ref.fuente === 'fixture') {
    const pool = [...TRACKS]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return { tracks: pool.slice(0, Math.min(n, pool.length)), pool: [...TRACKS], descartados: 0 }
  }

  const cache = leerCache(ref.id)
  const completos = [...(cache?.items ?? [])]
  const pistasConAnio = (c: Crudo) => !opts.requireAnio || c.anio !== null
  let validos = completos.filter(pistasConAnio).length
  let descartados = 0
  let pendientes = cache?.pendientes
  if (validos < n && !pendientes) {
    let entradas: EntradaRSS[] | undefined
    try {
      entradas = await fetchChart(ref)
    } catch {
      if (completos.length < 4) throw new Error('No se pudo descargar la lista (¿sin conexión?)')
    }
    if (entradas) {
      if (entradas.length === 0 && completos.length === 0) throw new Error('La lista vino vacía')
      const cacheIds = new Set(completos.map((track) => track.trackId))
      pendientes = entradas.filter((entrada) => !cacheIds.has(entrada.trackId))
    }
  }

  if (pendientes && validos < n) {
    const ids = new Set(completos.map((track) => track.trackId))
    let i = 0
    while (validos < n && i < pendientes.length) {
      const tanda = pendientes.slice(i, i + Math.max(n - validos + 5, 10))
      i += tanda.length
      for (const r of await mapLimit(tanda, 3, (e) => enriquecer(e, ref.cc))) {
        if (!r) {
          descartados++
        } else if (!ids.has(r.trackId)) {
          ids.add(r.trackId)
          completos.push(r)
          if (pistasConAnio(r)) validos++
        }
      }
    }
    // Otra carga del mismo chart puede haber avanzado mientras llegaban los lookups.
    const resto = pendientes.slice(i)
    const actualizado = leerCache(ref.id)
    if (!actualizado?.pendientes || actualizado.pendientes.length >= resto.length) {
      guardarCache(ref.id, completos, resto)
    }
  }
  if (completos.length < 4) {
    throw new Error(`Lista insuficiente: solo ${completos.length} temas con audio`)
  }
  const conAnio = opts.requireAnio ? completos.filter((c) => c.anio !== null) : completos
  if (opts.requireAnio && conAnio.length < 4) {
    throw new Error(`Lista insuficiente: solo ${conAnio.length} temas con año`)
  }

  const pool = [...conAnio]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const aTrack = (c: Crudo): HipsterTrack => ({
    trackId: c.trackId,
    titulo: c.titulo,
    artista: c.artista,
    album: c.album,
    previewUrl: c.previewUrl,
    artworkUrl: c.artworkUrl,
    anio: c.anio
  })
  return { tracks: pool.slice(0, Math.min(n, pool.length)).map(aTrack), pool: completos.map(aTrack), descartados }
}

// ==================== Búsqueda libre (el host arma su lista) ====================

export type TipoBusqueda = 'album' | 'artista'
export interface ResultadoBusqueda {
  tipo: TipoBusqueda
  id: number
  nombre: string
  subtitulo: string
  artworkUrl: string
}

function mapResultado(r: any, tipo: TipoBusqueda): ResultadoBusqueda | null {
  const nombre = tipo === 'album' ? r?.collectionName : r?.artistName
  if (!r || typeof nombre !== 'string' || !Number.isFinite(Number(tipo === 'album' ? r.collectionId : r.artistId))) {
    return null
  }
  return {
    tipo,
    id: Number(tipo === 'album' ? r.collectionId : r.artistId),
    nombre,
    subtitulo: tipo === 'album' ? (r.artistName ?? '') : `${r.primaryGenreName ?? 'Artista'}`,
    artworkUrl: typeof r.artworkUrl100 === 'string' ? artworkGrande(r.artworkUrl100) : ''
  }
}

/** Busca álbumes y artistas en iTunes. */
export async function buscarEnItunes(
  query: string,
  tipos: TipoBusqueda[] = ['album', 'artista'],
  country = 'ES'
): Promise<ResultadoBusqueda[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const term = encodeURIComponent(q)
  const peticiones: Array<Promise<{ tipo: TipoBusqueda; d: any }>> = []
  if (tipos.includes('album')) {
    peticiones.push(
      fetchConReintentos(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=8&country=${country}`,
        1
      )
        .catch(() => null)
        .then((d) => ({ tipo: 'album' as const, d }))
    )
  }
  if (tipos.includes('artista')) {
    peticiones.push(
      fetchConReintentos(
        `https://itunes.apple.com/search?term=${term}&media=music&entity=musicArtist&limit=5&country=${country}`,
        1
      )
        .catch(() => null)
        .then((d) => ({ tipo: 'artista' as const, d }))
    )
  }
  if (peticiones.length === 0) return []
  const res = await Promise.all(peticiones)
  if (res.every((r) => !r.d)) throw new Error('No se pudo buscar (¿sin conexión?)')
  const out: ResultadoBusqueda[] = []
  for (const { tipo, d } of res) {
    for (const r of d?.results ?? []) {
      const m = mapResultado(r, tipo)
      if (m && !out.some((o) => o.tipo === m.tipo && o.id === m.id)) out.push(m)
    }
  }
  return out
}

/** Convierte un álbum o artista de iTunes en rondas con audio. */
export async function prepararPartidaBusqueda(
  sel: ResultadoBusqueda,
  numRondas: number,
  country = 'ES',
  opts: { requireAnio?: boolean } = {}
): Promise<PartidaLista> {
  const n = Math.max(4, Math.min(30, Math.trunc(numRondas) || 5))
  const cacheKey = `busq:${sel.tipo}:${sel.id}`
  let crudos = leerCache(cacheKey)?.items
  if (!crudos) {
    let candidatos: any[] = []
    try {
      if (sel.tipo === 'album') {
        const d = await fetchConReintentos(
          `https://itunes.apple.com/lookup?id=${sel.id}&country=${country}&entity=song`
        )
        candidatos = (d?.results ?? []).filter((r: any) => r?.wrapperType === 'track' && r?.kind === 'song')
      } else {
        const d = await fetchConReintentos(
          `https://itunes.apple.com/search?term=${encodeURIComponent(sel.nombre)}&media=music&entity=song&limit=30&country=${country}&attribute=artistTerm`
        )
        candidatos = d?.results ?? []
      }
    } catch {
      throw new Error('No se pudo descargar la selección (¿sin conexión?)')
    }
    crudos = candidatos.map(mapLookup).filter((c): c is Crudo => c !== null)
    guardarCache(cacheKey, crudos)
  }
  const completos = crudos.filter((c) => !!c.previewUrl && (!opts.requireAnio || c.anio !== null))
  const descartados = crudos.length - completos.length
  if (completos.length < 4) {
    throw new Error(
      opts.requireAnio
        ? `Selección insuficiente: solo ${completos.length} temas con año`
        : `Selección insuficiente: solo ${completos.length} temas con audio`
    )
  }
  const pool = [...completos]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return {
    tracks: pool.slice(0, Math.min(n, pool.length)),
    pool: [...completos],
    descartados
  }
}
