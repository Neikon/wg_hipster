import type { HipsterAction, HipsterConfig, HipsterState, HipsterTrack, Dificultad, ModoJuego } from './types'
import { label } from './tracks'

export const DEFAULT_CONFIG: HipsterConfig = { segundos: 60, listaId: 'fiesta-clasicos', numRondas: 5, modo: 'titulo', dificultad: 'normal' }
export const PUNTOS_ACIERTO = 100
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
  const dificultad: Dificultad =
    input?.dificultad === 'facil' || input?.dificultad === 'dificil' ? input.dificultad : 'normal'
  return { segundos, listaId, numRondas, modo, dificultad }
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
  modo: ModoJuego
): Pick<HipsterState, 'clipUrl' | 'opciones' | 'respuestaCorrecta'> {
  const track = tracks[idx % tracks.length]
  if (modo === 'anio') {
    return { clipUrl: track.previewUrl, opciones: [], respuestaCorrecta: track.anio ?? 0 }
  }
  const correcta = label(track)
  const fuente = pool.length >= 4 ? pool : tracks
  const rand = rng(track.trackId * 31 + idx * 101 + fuente.length)
  const candidatos = fuente.filter((t) => t.trackId !== track.trackId).map(label)
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
    puntos,
    timer: normalized.segundos,
    version: 0,
    gameId: 'hipster',
    config: normalized
  }
}

function esAcierto(modo: ModoJuego, dificultad: Dificultad, respuesta: number, correcta: number): boolean {
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
    return {
      ...state,
      phase: 'pregunta',
      ronda,
      tracks,
      pool,
      ...buildRonda(tracks, pool, ronda, config.modo),
      respuestas: {},
      timer: config.segundos,
      config,
      version: state.version + 1
    }
  }
  if (action.t === 'answer') {
    if (state.phase !== 'pregunta') return state
    if (state.respuestas[ctx.peerId] !== undefined) return state
    if (state.timer <= 0) return state
    if (state.config.modo === 'anio') {
      // año escrito a mano: 1900–2100
      if (!Number.isInteger(action.opcion) || action.opcion < 1900 || action.opcion > 2100) return state
    } else if (action.opcion < 0 || action.opcion > 3) {
      return state
    }
    const respuestas = { ...state.respuestas, [ctx.peerId]: action.opcion }
    const withAnswer = { ...state, respuestas, version: state.version + 1 }
    const todos = Object.keys(withAnswer.puntos)
    if (todos.length > 0 && todos.every((pid) => respuestas[pid] !== undefined)) {
      return toResultados(withAnswer)
    }
    return withAnswer
  }
  if (action.t === 'tick') {
    if (!ctx.isHost) return state
    if (state.phase !== 'pregunta') return state
    const nt = state.timer - 1
    if (nt <= 0) return toResultados(state)
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
      ...buildRonda(state.tracks, state.pool, nr, state.config.modo),
      respuestas: {},
      timer: state.config.segundos,
      version: state.version + 1
    }
  }
  if (action.t === 'restart') {
    if (!ctx.isHost) return state
    // Rejugar conserva config; las rondas se reinyectan al empezar.
    const restarted = createInitialState(Object.keys(state.puntos).map((id) => ({ id })), state.config)
    return { ...restarted, version: state.version + 1 }
  }
  if (action.t === 'playerJoined') {
    if (!ctx.isHost || state.puntos[action.peerId] !== undefined) return state
    return { ...state, puntos: { ...state.puntos, [action.peerId]: 0 }, version: state.version + 1 }
  }
  return state
}
