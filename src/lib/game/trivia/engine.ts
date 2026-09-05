import type { TriviaState, TriviaAction, TriviaConfig, TriviaCategoria } from './types'
import { CATEGORIAS, QUESTIONS, questionsFor } from './questions'

export const DEFAULT_CONFIG: TriviaConfig = {
  numPreguntas: QUESTIONS.length,
  segundos: 20,
  categoria: 'todas'
}

function normalizeConfig(input?: Partial<TriviaConfig>): TriviaConfig {
  const categoria = CATEGORIAS.some(c => c.id === input?.categoria)
    ? input!.categoria as TriviaCategoria
    : DEFAULT_CONFIG.categoria
  const disponibles = questionsFor(categoria).length
  const numPreguntas = Math.max(1, Math.min(disponibles, Math.trunc(input?.numPreguntas ?? DEFAULT_CONFIG.numPreguntas)))
  const segundos = Math.max(5, Math.min(120, Math.trunc(input?.segundos ?? DEFAULT_CONFIG.segundos)))
  return { numPreguntas, segundos, categoria }
}

export function createInitialState(peers: {id:string}[], config: Partial<TriviaConfig> = {}): TriviaState {
  const normalized = normalizeConfig(config)
  const puntuaciones: Record<string,number> = {}
  for (const p of peers) puntuaciones[p.id]=0
  return {
    phase: 'lobby',
    preguntaIdx: 0,
    respuestas: {},
    puntuaciones,
    timer: normalized.segundos,
    version: 0,
    gameId: 'trivia',
    config: normalized
  }
}

function toResultados(state: TriviaState): TriviaState {
  const correcta = questionsFor(state.config.categoria)[state.preguntaIdx].correcta
  const nextPunt = { ...state.puntuaciones }
  for (const [pid, ans] of Object.entries(state.respuestas)) {
    if (ans === correcta) nextPunt[pid] = (nextPunt[pid]||0)+100
  }
  return { ...state, phase: 'resultados', timer: 5, puntuaciones: nextPunt, version: state.version+1 }
}

export function reducer(state: TriviaState, action: TriviaAction, ctx:{isHost:boolean, peerId:string}): TriviaState {
  // solo host puede iniciar y avanzar, pero answer puede venir de cualquier peer (validado por host)
  if (action.t === 'startGame') {
    if (!ctx.isHost) return state
    if (state.phase !== 'lobby' && state.phase !== 'final') return state
    const config = normalizeConfig(action.config ?? state.config)
    return { ...state, phase: 'pregunta', preguntaIdx: 0, respuestas: {}, timer: config.segundos, config, version: state.version+1 }
  }
  if (action.t === 'answer') {
    if (state.phase !== 'pregunta') return state
    if (state.respuestas[ctx.peerId] !== undefined) return state
    if (state.timer <= 0) return state
    // validar opcion rango
    if (action.opcion <0 || action.opcion>3) return state
    const respuestas = { ...state.respuestas, [ctx.peerId]: action.opcion }
    const withAnswer = { ...state, respuestas, version: state.version+1 }
    // si ya han respondido todos los jugadores conocidos, pasar a resultados sin esperar al timer
    const todos = Object.keys(withAnswer.puntuaciones)
    if (todos.length > 0 && todos.every(pid => respuestas[pid] !== undefined)) {
      return toResultados(withAnswer)
    }
    return withAnswer
  }
  if (action.t === 'tick') {
    if (!ctx.isHost) return state
    if (state.phase !== 'pregunta') return state
    const nt = state.timer -1
    if (nt <= 0) {
      // auto pasar a resultados, calcular puntos
      return toResultados(state)
    }
    return { ...state, timer: nt, version: state.version+1 }
  }
  if (action.t === 'nextQuestion') {
    if (!ctx.isHost) return state
    if (state.phase !== 'resultados') return state
    const ni = state.preguntaIdx +1
    if (ni >= state.config.numPreguntas) {
      return { ...state, phase: 'final', version: state.version+1 }
    }
    return { ...state, phase: 'pregunta', preguntaIdx: ni, respuestas: {}, timer: state.config.segundos, version: state.version+1 }
  }
  if (action.t === 'restart') {
    if (!ctx.isHost) return state
    const restarted = createInitialState(Object.keys(state.puntuaciones).map(id=>({id})), state.config)
    return { ...restarted, version: state.version + 1 }
  }
  if (action.t === 'playerJoined') {
    if (!ctx.isHost || state.puntuaciones[action.peerId] !== undefined) return state
    return {
      ...state,
      puntuaciones: { ...state.puntuaciones, [action.peerId]: 0 },
      version: state.version + 1
    }
  }
  return state
}
