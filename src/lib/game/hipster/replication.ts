import type { GameReplication } from '../types'
import { mostrarAlbum, pistaTitulo } from './tracks'
import type { HipsterState, HipsterTrack } from './types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function publicTrack(state: HipsterState, track: HipsterTrack): HipsterTrack {
  if (state.phase !== 'pregunta') return track
  const pistas = state.config.modo === 'titulo' && state.config.dificultad !== 'experto'
    ? state.config.pistas : []
  return {
    trackId: 0,
    titulo: pistas.includes('titulo') ? pistaTitulo(track.titulo) : '',
    artista: pistas.includes('artista') ? track.artista : '',
    album: pistas.includes('album') && mostrarAlbum(track) ? track.album : '',
    anio: pistas.includes('anio') ? track.anio : null,
    previewUrl: '',
    artworkUrl: ''
  }
}

export const hipsterReplication: GameReplication<HipsterState> = {
  publicState(state, peerId) {
    const tracks = new Array<HipsterTrack>(state.tracks.length)
    const track = state.tracks[state.ronda]
    if (track && state.phase !== 'final') tracks[state.ronda] = publicTrack(state, track)
    const revelado = state.phase === 'resultados'
    const propia = state.respuestas[peerId]
    return {
      ...state,
      tracks,
      pool: [],
      respuestaCorrecta: revelado ? state.respuestaCorrecta : -1,
      respuestas: revelado ? state.respuestas : propia === undefined ? {} : { [peerId]: propia },
      respondieron: Object.keys(state.respuestas),
      veredictos: revelado ? state.veredictos : {}
    }
  },

  recovery({ tracks, pool, ...state }) {
    return { state, deck: { tracks, pool } }
  },

  validState(state): state is HipsterState {
    return record(state) && state.gameId === 'hipster'
      && (state.phase === 'lobby' || state.phase === 'pregunta' || state.phase === 'correccion'
        || state.phase === 'resultados' || state.phase === 'final')
      && Number.isSafeInteger(state.version) && Number.isSafeInteger(state.ronda)
      && Number.isFinite(state.timer) && typeof state.clipUrl === 'string'
      && Array.isArray(state.tracks) && Array.isArray(state.pool)
      && Array.isArray(state.opciones) && state.opciones.every((o) => typeof o === 'string')
      && record(state.puntos) && record(state.respuestas) && record(state.veredictos)
      && (state.respondieron === undefined || (Array.isArray(state.respondieron)
        && state.respondieron.every((id) => typeof id === 'string')))
      && record(state.config) && Array.isArray(state.config.pistas)
  }
}
