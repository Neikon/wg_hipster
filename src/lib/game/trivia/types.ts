export type TriviaCategoria = 'todas' | 'geografia' | 'ciencia' | 'cultura' | 'deportes'

export interface TriviaConfig {
  numPreguntas: number
  segundos: number
  categoria: TriviaCategoria
}

export interface TriviaState {
  phase: 'lobby' | 'pregunta' | 'resultados' | 'final'
  preguntaIdx: number
  respuestas: Record<string, number> // peerId -> opcion idx
  puntuaciones: Record<string, number>
  timer: number
  version: number
  gameId: 'trivia'
  config: TriviaConfig
}
export type TriviaAction =
  | { t: 'startGame'; juegoId?: 'trivia'; config?: Partial<TriviaConfig> }
  | { t: 'answer'; opcion: number }
  | { t: 'nextQuestion' }
  | { t: 'tick' }
  | { t: 'restart' }
  | { t: 'playerJoined'; peerId: string }
