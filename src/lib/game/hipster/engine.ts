import type { HipsterAction, HipsterConfig, HipsterState } from './types'
import { TRACKS, label } from './tracks'

export const DEFAULT_CONFIG: HipsterConfig = { segundos: 60 }
export const PUNTOS_ACIERTO = 100

function normalizeConfig(input?: Partial<HipsterConfig>): HipsterConfig {
  const segundos = Math.max(5, Math.min(300, Math.trunc(input?.segundos ?? DEFAULT_CONFIG.segundos)))
  return { segundos: Number.isFinite(segundos) ? segundos : DEFAULT_CONFIG.segundos }
}

function buildRonda(idx: number): Pick<HipsterState, 'clipUrl' | 'opciones' | 'respuestaCorrecta'> {
  const track = TRACKS[idx % TRACKS.length]
  // Correcta fija en posición 0 para la prueba; distractores = otros títulos.
  const distractores = TRACKS.filter((_, i) => i % TRACKS.length !== idx % TRACKS.length)
    .slice(0, 3)
    .map(label)
  return { clipUrl: track.previewUrl, opciones: [label(track), ...distractores], respuestaCorrecta: 0 }
}

export function createInitialState(peers: { id: string }[], config: Partial<HipsterConfig> = {}): HipsterState {
  const normalized = normalizeConfig(config)
  const puntos: Record<string, number> = {}
  for (const p of peers) puntos[p.id] = 0
  return {
    phase: 'lobby',
    ronda: 0,
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

function toResultados(state: HipsterState): HipsterState {
  const puntos = { ...state.puntos }
  for (const [pid, ans] of Object.entries(state.respuestas)) {
    if (ans === state.respuestaCorrecta) puntos[pid] = (puntos[pid] ?? 0) + PUNTOS_ACIERTO
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
    const config = normalizeConfig(action.config ?? state.config)
    const ronda = 0
    return {
      ...state,
      phase: 'pregunta',
      ronda,
      ...buildRonda(ronda),
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
    if (action.opcion < 0 || action.opcion > 3) return state
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
    if (nr >= TRACKS.length) return { ...state, phase: 'final', version: state.version + 1 }
    return {
      ...state,
      phase: 'pregunta',
      ronda: nr,
      ...buildRonda(nr),
      respuestas: {},
      timer: state.config.segundos,
      version: state.version + 1
    }
  }
  if (action.t === 'restart') {
    if (!ctx.isHost) return state
    const restarted = createInitialState(Object.keys(state.puntos).map((id) => ({ id })), state.config)
    return { ...restarted, version: state.version + 1 }
  }
  if (action.t === 'playerJoined') {
    if (!ctx.isHost || state.puntos[action.peerId] !== undefined) return state
    return { ...state, puntos: { ...state.puntos, [action.peerId]: 0 }, version: state.version + 1 }
  }
  return state
}
