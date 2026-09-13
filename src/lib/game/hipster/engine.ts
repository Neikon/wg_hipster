import type { HipsterAction, HipsterConfig, HipsterState, HipsterTrack, Dificultad, ModoJuego, Pista } from './types'
import { label } from './tracks'

export const DEFAULT_CONFIG: HipsterConfig = {
  segundos: 60,
  listaId: 'fiesta-clasicos',
  numRondas: 5,
  modo: 'titulo',
  dificultad: 'normal',
  pistas: ['artista']
}
/** Presets del selector Pistas según dificultad (luego ajustables). */
export function pistasPara(dificultad: Dificultad): Pista[] {
  if (dificultad === 'facil') return ['titulo', 'artista', 'anio', 'album']
  if (dificultad === 'dificil') return []
  if (dificultad === 'experto') return []
  return ['artista']
}
export const PUNTOS_ACIERTO = 100
/** Puntos extra por toque del host en la corrección de experto. */
export const PUNTOS_EXTRA = 50
/** Experto = modo título sin opciones: se escribe el título y corrige el host. */
export function esExperto(config: Pick<HipsterConfig, 'modo' | 'dificultad'>): boolean {
  return config.modo === 'titulo' && config.dificultad === 'experto'
}
/** Margen del modo año según dificultad: fácil ±10, normal ±5, difícil ±2. */
export function margenPara(dificultad: Dificultad): number {
  if (dificultad === 'facil') return 10
  if (dificultad === 'dificil') return 2
  return 5
}

function normalizeConfig(input?: Partial<HipsterConfig>): HipsterConfig {
  const rawSeg = Math.trunc(input?.segundos ?? DEFAULT_CONFIG.segundos)
  const segundos = Number.isFinite(rawSeg) ? Math.max(5, Math.min(300, rawSeg)) : DEFAULT_CONFIG.segundos
  const rawRon = Math.trunc(input?.numRondas ?? DEFAULT_CONFIG.numRondas)
  const numRondas = Number.isFinite(rawRon) ? Math.max(4, Math.min(30, rawRon)) : DEFAULT_CONFIG.numRondas
  const listaId = typeof input?.listaId === 'string' && input.listaId ? input.listaId : DEFAULT_CONFIG.listaId
  const modo: ModoJuego = input?.modo === 'anio' ? 'anio' : 'titulo'
  const pedida = input?.dificultad
  let dificultad: Dificultad =
    pedida === 'facil' || pedida === 'dificil' || pedida === 'experto' ? pedida : 'normal'
  // Experto solo tiene sentido en modo título (sin opciones que corregir);
  // en año se degrada a normal sin tocar nada más.
  if (modo === 'anio' && dificultad === 'experto') dificultad = 'normal'
  const validas: Pista[] = ['titulo', 'artista', 'anio', 'album']
  const pistas = Array.isArray(input?.pistas)
    ? (input.pistas as unknown[]).filter((p): p is Pista => validas.includes(p as Pista))
    : [...DEFAULT_CONFIG.pistas]
  return { segundos, listaId, numRondas, modo, dificultad, pistas }
}

function tracksValidos(tracks: unknown): tracks is HipsterTrack[] {
  return (
    Array.isArray(tracks) &&
    tracks.length >= 4 &&
    tracks.every(
      (t) =>
        t &&
        typeof t.titulo === 'string' &&
        typeof t.artista === 'string' &&
        typeof t.previewUrl === 'string' &&
        t.previewUrl.startsWith('http')
    )
  )
}

/** PRNG determinista: el reducer debe ser puro (sin Math.random) pero
 *  la posición de la correcta tiene que variar por ronda. */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * Distractores desde la lista original completa (pool), no del corte de N
 * rondas: excluye el track actual, baraja con semilla de ronda y coge 3.
 * En modo año no hay opciones: la respuesta correcta es el año.
 */
function buildRonda(
  tracks: HipsterTrack[],
  pool: HipsterTrack[],
  idx: number,
  modo: ModoJuego,
  sinOpciones = false
): Pick<HipsterState, 'clipUrl' | 'opciones' | 'respuestaCorrecta'> {
  const track = tracks[idx % tracks.length]
  if (modo === 'anio' || sinOpciones) {
    return { clipUrl: track.previewUrl, opciones: [], respuestaCorrecta: track.anio ?? 0 }
  }
  // Las opciones muestran SOLO el título: el artista saldría en las pistas y
  // delataría la respuesta. Si dos temas comparten título se desempata con el artista.
  const fuente = pool.length >= 4 ? pool : tracks
  const etiqueta = (t: HipsterTrack): string => {
    const mismoTitulo = fuente.some((o) => o.trackId !== t.trackId && o.titulo === t.titulo)
    return mismoTitulo ? label(t) : t.titulo
  }
  const correcta = etiqueta(track)
  const rand = rng(track.trackId * 31 + idx * 101 + fuente.length)
  const candidatos = fuente.filter((t) => t.trackId !== track.trackId).map(etiqueta)
  // quitar duplicados de etiqueta (mismo título de otro álbum) y barajar
  const vistos = new Set<string>()
  const unicos = candidatos.filter((l) => (vistos.has(l) ? false : (vistos.add(l), true)))
  for (let i = unicos.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[unicos[i], unicos[j]] = [unicos[j], unicos[i]]
  }
  const distractores = unicos.slice(0, 3)
  // Barajar opciones con la misma semilla: determinista (mismo estado → mismo orden).
  const opciones = [correcta, ...distractores]
  for (let i = opciones.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[opciones[i], opciones[j]] = [opciones[j], opciones[i]]
  }
  return { clipUrl: track.previewUrl, opciones, respuestaCorrecta: opciones.indexOf(correcta) }
}

export function createInitialState(peers: { id: string }[], config: Partial<HipsterConfig> = {}): HipsterState {
  const normalized = normalizeConfig(config)
  const puntos: Record<string, number> = {}
  for (const p of peers) puntos[p.id] = 0
  return {
    phase: 'lobby',
    ronda: 0,
    tracks: [],
    pool: [],
    clipUrl: '',
    opciones: [],
    respuestaCorrecta: 0,
    respuestas: {},
    veredictos: {},
    puntos,
    timer: normalized.segundos,
    version: 0,
    gameId: 'hipster',
    config: normalized,
    autoplayDefault: true
  }
}

function esAcierto(modo: ModoJuego, dificultad: Dificultad, respuesta: number | string, correcta: number): boolean {
  if (typeof respuesta !== 'number') return false
  if (modo === 'anio') return Math.abs(respuesta - correcta) <= margenPara(dificultad)
  return respuesta === correcta
}

function toResultados(state: HipsterState): HipsterState {
  const puntos = { ...state.puntos }
  for (const [pid, ans] of Object.entries(state.respuestas)) {
    if (esAcierto(state.config.modo, state.config.dificultad, ans, state.respuestaCorrecta)) {
      puntos[pid] = (puntos[pid] ?? 0) + PUNTOS_ACIERTO
    }
  }
  return { ...state, phase: 'resultados', timer: 5, puntos, version: state.version + 1 }
}

/** Fin de pregunta en experto: sin puntos aún; el host corrige a mano. */
function toCorreccion(state: HipsterState): HipsterState {
  return { ...state, phase: 'correccion', veredictos: {}, timer: state.timer, version: state.version + 1 }
}

/** Cierre de la corrección: +100 por buena más extras del host. */
function cerrarCorreccion(state: HipsterState): HipsterState {
  const puntos = { ...state.puntos }
  for (const [pid, v] of Object.entries(state.veredictos)) {
    if (v.buena) puntos[pid] = (puntos[pid] ?? 0) + PUNTOS_ACIERTO
    if (v.extra > 0) puntos[pid] = (puntos[pid] ?? 0) + v.extra
  }
  return { ...state, phase: 'resultados', timer: 5, puntos, version: state.version + 1 }
}

export function reducer(
  state: HipsterState,
  action: HipsterAction,
  ctx: { isHost: boolean; peerId: string }
): HipsterState {
  if (action.t === 'startGame') {
    if (!ctx.isHost) return state
    if (state.phase !== 'lobby' && state.phase !== 'final') return state
    // La partida solo arranca con rondas 100 % completas (inyectadas por el host).
    // El pool (lista original) viaja también: de ahí salen los distractores.
    // En modo año todos los tracks deben traer año.
    const tracks = tracksValidos(action.tracks) ? action.tracks : null
    if (!tracks) return state
    const pool = tracksValidos(action.pool) ? action.pool : tracks
    const config = normalizeConfig(action.config ?? state.config)
    if (config.modo === 'anio' && tracks.some((t) => t.anio === null)) return state
    const ronda = 0
    const experto = esExperto(config)
    return {
      ...state,
      phase: 'pregunta',
      ronda,
      tracks,
      pool,
      ...buildRonda(tracks, pool, ronda, config.modo, experto),
      respuestas: {},
      veredictos: {},
      timer: config.segundos,
      config,
      version: state.version + 1
    }
  }
  if (action.t === 'answer') {
    if (state.phase !== 'pregunta') return state
    // En experto solo vale texto (answerTexto); el índice nunca puntúa.
    if (esExperto(state.config)) return state
    // En título con opciones se puede cambiar hasta el cierre; año bloquea.
    const cambiable = state.config.modo === 'titulo'
    if (!cambiable && state.respuestas[ctx.peerId] !== undefined) return state
    if (state.timer <= 0) return state
    if (state.config.modo === 'anio') {
      // año escrito a mano: 1900–2100
      if (!Number.isInteger(action.opcion) || action.opcion < 1900 || action.opcion > 2100) return state
    } else if (action.opcion < 0 || action.opcion > 3) {
      return state
    }
    if (!cambiable || state.respuestas[ctx.peerId] !== action.opcion) {
      const respuestas = { ...state.respuestas, [ctx.peerId]: action.opcion }
      const withAnswer = { ...state, respuestas, version: state.version + 1 }
      const todos = Object.keys(withAnswer.puntos)
      if (todos.length > 0 && todos.every((pid) => respuestas[pid] !== undefined)) {
        return toResultados(withAnswer)
      }
      return withAnswer
    }
    return state
  }
  if (action.t === 'answerTexto') {
    // Experto: título escrito a mano, se bloquea al enviar.
    if (state.phase !== 'pregunta') return state
    if (!esExperto(state.config)) return state
    if (state.respuestas[ctx.peerId] !== undefined) return state
    if (state.timer <= 0) return state
    const texto = action.texto.trim().slice(0, 140)
    if (!texto) return state
    const respuestas = { ...state.respuestas, [ctx.peerId]: texto }
    const withAnswer = { ...state, respuestas, version: state.version + 1 }
    const todos = Object.keys(withAnswer.puntos)
    if (todos.length > 0 && todos.every((pid) => respuestas[pid] !== undefined)) {
      return toCorreccion(withAnswer)
    }
    return withAnswer
  }
  if (action.t === 'veredicto') {
    // Solo el host, en corrección y sobre una respuesta existente.
    if (!ctx.isHost || state.phase !== 'correccion') return state
    if (!esExperto(state.config)) return state
    if (state.respuestas[action.peerId] === undefined) return state
    const prev = state.veredictos[action.peerId]
    const veredictos = { ...state.veredictos, [action.peerId]: { buena: action.buena, extra: prev?.extra ?? 0 } }
    return { ...state, veredictos, version: state.version + 1 }
  }
  if (action.t === 'extra') {
    // Solo el host, en corrección: suma puntos extra a una respuesta.
    if (!ctx.isHost || state.phase !== 'correccion') return state
    if (!esExperto(state.config)) return state
    if (state.respuestas[action.peerId] === undefined) return state
    if (!Number.isInteger(action.puntos) || action.puntos <= 0 || action.puntos > 500) return state
    const prev = state.veredictos[action.peerId] ?? { buena: false, extra: 0 }
    const veredictos = { ...state.veredictos, [action.peerId]: { ...prev, extra: prev.extra + action.puntos } }
    return { ...state, veredictos, version: state.version + 1 }
  }
  if (action.t === 'cerrarCorreccion') {
    if (!ctx.isHost || state.phase !== 'correccion') return state
    if (!esExperto(state.config)) return state
    return cerrarCorreccion(state)
  }
  if (action.t === 'setAutoplayDefault') {
    // Solo el host fija el default de la partida; se ignora si viene de invitado.
    if (!ctx.isHost) return state
    if (state.autoplayDefault === action.valor) return state
    return { ...state, autoplayDefault: action.valor, version: state.version + 1 }
  }
  if (action.t === 'tick') {
    if (!ctx.isHost) return state
    if (state.phase !== 'pregunta') return state
    const nt = state.timer - 1
    if (nt <= 0) return esExperto(state.config) ? toCorreccion(state) : toResultados(state)
    return { ...state, timer: nt, version: state.version + 1 }
  }
  if (action.t === 'next') {
    if (!ctx.isHost) return state
    if (state.phase !== 'resultados') return state
    const nr = state.ronda + 1
    if (nr >= state.tracks.length) return { ...state, phase: 'final', version: state.version + 1 }
    return {
      ...state,
      phase: 'pregunta',
      ronda: nr,
      ...buildRonda(state.tracks, state.pool, nr, state.config.modo, esExperto(state.config)),
      respuestas: {},
      veredictos: {},
      timer: state.config.segundos,
      version: state.version + 1
    }
  }
  if (action.t === 'restart') {
    if (!ctx.isHost) return state
    // Rejugar conserva config y default de autoplay; las rondas se reinyectan al empezar.
    const restarted = createInitialState(Object.keys(state.puntos).map((id) => ({ id })), state.config)
    restarted.autoplayDefault = state.autoplayDefault
    return { ...restarted, version: state.version + 1 }
  }
  if (action.t === 'playerJoined') {
    if (!ctx.isHost || state.puntos[action.peerId] !== undefined) return state
    return { ...state, puntos: { ...state.puntos, [action.peerId]: 0 }, version: state.version + 1 }
  }
  if (action.t === 'playerLeft') {
    // Solo el host: saca al que se fue para no bloquear el "todos han respondido".
    if (!ctx.isHost) return state
    if (state.puntos[action.peerId] === undefined && state.respuestas[action.peerId] === undefined) {
      return state
    }
    const puntos = { ...state.puntos }
    const respuestas = { ...state.respuestas }
    const veredictos = { ...state.veredictos }
    delete puntos[action.peerId]
    delete respuestas[action.peerId]
    delete veredictos[action.peerId]
    const sinEl = { ...state, puntos, respuestas, veredictos, version: state.version + 1 }
    // si con su salida ya están todos, cerrar la ronda sin esperar al timer
    if (
      sinEl.phase === 'pregunta' &&
      Object.keys(sinEl.puntos).length > 0 &&
      Object.keys(sinEl.puntos).every((pid) => sinEl.respuestas[pid] !== undefined)
    ) {
      return esExperto(sinEl.config) ? toCorreccion(sinEl) : toResultados(sinEl)
    }
    return sinEl
  }
  return state
}
