export interface HipsterTrack {
  trackId: number
  titulo: string
  artista: string
  album: string
  previewUrl: string
  artworkUrl: string
}

export interface HipsterConfig {
  segundos: number
}

export interface HipsterState {
  phase: 'lobby' | 'pregunta' | 'resultados' | 'final'
  ronda: number
  clipUrl: string
  opciones: string[]
  respuestaCorrecta: number
  respuestas: Record<string, number> // peerId -> opcion idx
  puntos: Record<string, number>
  timer: number
  version: number
  gameId: 'hipster'
  config: HipsterConfig
}

export type HipsterAction =
  | { t: 'startGame'; juegoId?: 'hipster'; config?: Partial<HipsterConfig> }
  | { t: 'answer'; opcion: number }
  | { t: 'tick' }
  | { t: 'next' }
  | { t: 'restart' }
  | { t: 'playerJoined'; peerId: string }
