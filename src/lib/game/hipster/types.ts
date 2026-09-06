export interface HipsterTrack {
  trackId: number
  titulo: string
  artista: string
  album: string
  previewUrl: string
  artworkUrl: string
  /** Año de lanzamiento (puede faltar según la fuente). */
  anio: number | null
}

export type ModoJuego = 'titulo' | 'anio'
export type Dificultad = 'facil' | 'normal' | 'dificil'
/** Info extra que se muestra al jugador para ayudarle a responder. */
export type Pista = 'titulo' | 'artista' | 'anio' | 'album'

export interface HipsterConfig {
  segundos: number
  listaId: string
  numRondas: number
  modo: ModoJuego
  dificultad: Dificultad
  pistas: Pista[]
}

export interface HipsterState {
  phase: 'lobby' | 'pregunta' | 'resultados' | 'final'
  ronda: number
  /** Rondas elegidas (corte de N). */
  tracks: HipsterTrack[]
  /** Lista original completa: de aquí salen los distractores. */
  pool: HipsterTrack[]
  clipUrl: string
  opciones: string[]
  respuestaCorrecta: number
  respuestas: Record<string, number> // peerId -> opcion idx
  puntos: Record<string, number>
  timer: number
  version: number
  gameId: 'hipster'
  config: HipsterConfig
  /**
   * Autoplay por defecto de la partida (sincronizado, solo lo escribe el host).
   * Cada móvil combina con su decisión local: efectivo = override ?? default.
   */
  autoplayDefault: boolean
}

export type HipsterAction =
  | { t: 'startGame'; juegoId?: 'hipster'; config?: Partial<HipsterConfig>; tracks?: HipsterTrack[]; pool?: HipsterTrack[] }
  | { t: 'answer'; opcion: number }
  | { t: 'setAutoplayDefault'; valor: boolean }
  | { t: 'tick' }
  | { t: 'next' }
  | { t: 'restart' }
  | { t: 'playerJoined'; peerId: string }
