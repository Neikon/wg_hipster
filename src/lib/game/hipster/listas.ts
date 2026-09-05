import type { HipsterTrack } from './types'
import { TRACKS } from './tracks'

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

// Todo Apple (RSS + Search + Lookup) envía `Access-Control-Allow-Origin: *`,
// así que el host puede descargarlo directo desde el navegador. Deezer no
// envía esa cabecera y el navegador bloquea su lectura: no usar.
export const LISTAS: readonly ListaRef[] = [
  { id: 'top-global', nombre: 'Top global', fuente: 'itunes-rss', cc: 'us', genre: '' },
  { id: 'top-espana', nombre: 'Top España', fuente: 'itunes-rss', cc: 'es', genre: '' },
  { id: 'top-japon', nombre: 'Top Japón', fuente: 'itunes-rss', cc: 'jp', genre: '' },
  { id: 'top-rock', nombre: 'Top Rock', fuente: 'itunes-rss', cc: 'us', genre: '21' },
  { id: 'top-pop', nombre: 'Top Pop', fuente: 'itunes-rss', cc: 'us', genre: '14' },
  { id: 'top-reggaeton', nombre: 'Top Reggaeton', fuente: 'itunes-rss', cc: 'us', genre: '12' }
]

// Reserva sin conexión: no sale en el desplegable, pero sigue siendo el
// fallback (DEFAULT_CONFIG) y lo usan los tests sin red.
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
}

function artworkGrande(url: string): string {
  return url.replace(/\/\d+x\d+bb\.jpg$/, '/600x600bb.jpg')
}

function mapLookup(r: any): Crudo | null {
  if (!r || typeof r.trackName !== 'string' || typeof r.artistName !== 'string') return null
  return {
    trackId: Number(r.trackId) || 0,
    titulo: r.trackName,
    artista: r.artistName,
    album: r.collectionName ?? '',
    previewUrl: typeof r.previewUrl === 'string' ? r.previewUrl : '',
    artworkUrl: typeof r.artworkUrl100 === 'string' ? artworkGrande(r.artworkUrl100) : ''
  }
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<any> {  const ctrl = new AbortController()
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

let jsonpSeq = 0

/**
 * Lee la API pública de Deezer por JSONP (<script> en vez de fetch),
 * porque no envía cabecera CORS y el navegador bloquearía la lectura.
 */
export function jsonp<T>(baseUrl: string, timeoutMs = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('JSONP solo disponible en navegador'))
      return
    }
    const cb = `__dz${Date.now()}_${jsonpSeq++}`
    const sep = baseUrl.includes('?') ? '&' : '?'
    const script = document.createElement('script')
    const limpiar = () => {
      clearTimeout(timer)
      script.remove()
      try {
        delete (window as any)[cb]
      } catch {
        ;(window as any)[cb] = undefined
      }
    }
    const timer = setTimeout(() => {
      limpiar()
      reject(new Error('Tiempo agotado'))
    }, timeoutMs)
    ;(window as any)[cb] = (data: T) => {
      limpiar()
      resolve(data)
    }
    script.onerror = () => {
      limpiar()
      reject(new Error('No se pudo cargar'))
    }
    script.src = `${baseUrl}${sep}output=jsonp&callback=${cb}`
    document.head.appendChild(script)
  })
}

/** Mapea un track de Deezer a nuestro formato (exportado para tests). */
export function mapTrackDeezer(r: any): Crudo | null {
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

/** Descarga los tracks de una playlist de Deezer (paginado, vía JSONP). */
export async function fetchPlaylistDeezer(playlistId: number, max = 200): Promise<Crudo[]> {
  const out: Crudo[] = []
  let index = 0
  while (out.length < max) {
    const d = await jsonp<{ data?: any[]; total?: number }>(
      `https://api.deezer.com/playlist/${playlistId}/tracks?limit=100&index=${index}`
    )
    const items = d?.data ?? []
    for (const r of items) {
      const m = mapTrackDeezer(r)
      if (m) out.push(m)
    }
    if (items.length < 100) break
    index += 100
    await new Promise((r) => setTimeout(r, 300))
  }
  return out
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
 * El host prepara rondas completas: descarga el chart, enriquece con lookup
 * hasta tener numRondas temas con audio (o agota el chart), baraja y corta.
 * Garantiza tracks 100 % reproducibles o lanza error explicando el paso.
 */
export async function prepararPartida(listaId: string, numRondas: number): Promise<PartidaLista> {
  const ref = getLista(listaId)
  if (!ref) throw new Error('Lista desconocida')
  const n = Math.max(4, Math.min(30, Math.trunc(numRondas) || 5))

  if (ref.fuente === 'fixture') {
    const pool = [...TRACKS]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return { tracks: pool.slice(0, Math.min(n, pool.length)), descartados: 0 }
  }

  let cache = leerCache(ref.id)
  let entradas: EntradaRSS[]
  if (cache) {
    entradas = cache.map((c) => ({ trackId: c.trackId, titulo: c.titulo, artista: c.artista }))
  } else {
    try {
      entradas = await fetchChart(ref)
    } catch {
      throw new Error('No se pudo descargar la lista (¿sin conexión?)')
    }
    if (entradas.length === 0) throw new Error('La lista vino vacía')
  }

  // Enriquecer por oleadas hasta completar las rondas (sin pedir de más).
  const completos: Crudo[] = cache ? (cache as Crudo[]) : []
  let descartados = 0
  if (!cache) {
    const objetivo = Math.min(n + 5, entradas.length)
    const tanda = entradas.slice(0, Math.max(objetivo, 10))
    const res = await mapLimit(tanda, 3, (e) => enriquecer(e, ref.cc))
    for (const r of res) {
      if (r) completos.push(r)
      else descartados++
    }
    guardarCache(ref.id, completos)
  }
  if (completos.length < 4) {
    throw new Error(`Lista insuficiente: solo ${completos.length} temas con audio`)
  }

  const pool = [...completos]
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

// ==================== Búsqueda libre (el host arma su lista) ====================

export type TipoBusqueda = 'album' | 'artista' | 'lista'
export interface ResultadoBusqueda {
  tipo: TipoBusqueda
  id: number
  nombre: string
  subtitulo: string
  artworkUrl: string
}

function mapResultado(r: any, tipo: TipoBusqueda): ResultadoBusqueda | null {
  if (tipo === 'lista') {
    if (!r || typeof r.title !== 'string' || !Number.isFinite(Number(r.id))) return null
    return {
      tipo,
      id: Number(r.id),
      nombre: r.title,
      subtitulo: `${r.nb_tracks ?? '?'} canciones`,
      artworkUrl: r.picture_medium ?? r.picture_small ?? ''
    }
  }
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

/**
 * Busca en iTunes (álbumes y artistas) y en Deezer (playlists).
 * Nota: las playlists solo existen en Deezer; como su API no envía CORS,
 * se leen por JSONP (<script>) en vez de fetch. iTunes va por fetch.
 */
export async function buscarEnItunes(
  query: string,
  tipos: TipoBusqueda[] = ['album', 'artista', 'lista'],
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
  if (tipos.includes('lista')) {
    peticiones.push(
      jsonp<{ data?: any[] }>(`https://api.deezer.com/search/playlist?q=${term}&limit=8`)
        .catch(() => null)
        .then((d) => ({ tipo: 'lista' as const, d: d ? { results: d.data } : null }))
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

/**
 * Convierte un álbum, artista o playlist elegidos en rondas completas:
 * álbum → sus canciones por lookup; artista → sus top-canciones por search;
 * playlist (Deezer, vía JSONP) → sus tracks directos.
 */
export async function prepararPartidaBusqueda(
  sel: ResultadoBusqueda,
  numRondas: number,
  country = 'ES'
): Promise<PartidaLista> {
  const n = Math.max(4, Math.min(30, Math.trunc(numRondas) || 5))
  const cacheKey = `busq:${sel.tipo}:${sel.id}`
  let crudos = leerCache(cacheKey)
  if (!crudos) {
    let candidatos: any[] = []
    try {
      if (sel.tipo === 'album') {
        const d = await fetchConReintentos(
          `https://itunes.apple.com/lookup?id=${sel.id}&country=${country}&entity=song`
        )
        candidatos = (d?.results ?? []).filter((r: any) => r?.wrapperType === 'track' && r?.kind === 'song')
      } else if (sel.tipo === 'lista') {
        const tracks = await fetchPlaylistDeezer(sel.id)
        crudos = tracks
        guardarCache(cacheKey, crudos)
      } else {
        const d = await fetchConReintentos(
          `https://itunes.apple.com/search?term=${encodeURIComponent(sel.nombre)}&media=music&entity=song&limit=30&country=${country}&attribute=artistTerm`
        )
        candidatos = d?.results ?? []
      }
    } catch {
      throw new Error('No se pudo descargar la selección (¿sin conexión?)')
    }
    if (sel.tipo !== 'lista') {
      crudos = candidatos.map(mapLookup).filter(Boolean) as Crudo[]
      guardarCache(cacheKey, crudos)
    }
  }
  if (!crudos) throw new Error('No se pudo descargar la selección (¿sin conexión?)')
  const completos = crudos.filter((c) => !!c.previewUrl)
  const descartados = crudos.length - completos.length
  if (completos.length < 4) {
    throw new Error(`Selección insuficiente: solo ${completos.length} temas con audio`)
  }
  const pool = [...completos]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return {
    tracks: pool.slice(0, Math.min(n, pool.length)),
    descartados
  }
}
