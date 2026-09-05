export interface HipsterTrack {
  trackId: number
  titulo: string
  artista: string
  album: string
  previewUrl: string
  artworkUrl: string
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
}

export type HipsterAction =
  | { t: 'startGame'; juegoId?: 'hipster' }
  | { t: 'answer'; opcion: number }
  | { t: 'tick' }
  | { t: 'next' }
  | { t: 'restart' }
  | { t: 'playerJoined'; peerId: string }
