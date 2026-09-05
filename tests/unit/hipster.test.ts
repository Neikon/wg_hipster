import { describe, it, expect, vi, afterEach } from 'vitest'
import { createInitialState, reducer } from '../../src/lib/game/hipster/engine'
import { TRACKS } from '../../src/lib/game/hipster/tracks'
import { LISTAS, prepararPartida } from '../../src/lib/game/hipster/listas'
import type { HipsterTrack } from '../../src/lib/game/hipster/types'

const host = { isHost: true, peerId: 'host1' }
const guest = { isHost: false, peerId: 'guest1' }

function empezar(s: ReturnType<typeof createInitialState>, tracks: HipsterTrack[] = [...TRACKS]) {
  return reducer(s, { t: 'startGame', juegoId: 'hipster', tracks }, host)
}

describe('hipster engine', () => {
  it('estado inicial en lobby con fixture de 5', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(s.phase).toBe('lobby')
    expect(s.gameId).toBe('hipster')
    expect(s.version).toBe(0)
    expect(s.tracks).toEqual([])
    expect(TRACKS).toHaveLength(5)
    for (const t of TRACKS) expect(t.previewUrl).toMatch(/^https:\/\//)
  })

  it('ignora startGame sin rondas completas', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(reducer(s, { t: 'startGame', juegoId: 'hipster' }, host)).toBe(s)
    expect(reducer(s, { t: 'startGame', juegoId: 'hipster', tracks: [] }, host)).toBe(s)
    expect(
      reducer(
        s,
        {
          t: 'startGame',
          juegoId: 'hipster',
          tracks: [{ titulo: 'X', artista: 'Y', previewUrl: '', trackId: 1, album: '', artworkUrl: '' }]
        },
        host
      )
    ).toBe(s)
  })

  it('solo el host puede empezar', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(reducer(s, { t: 'startGame', juegoId: 'hipster', tracks: [...TRACKS] }, guest)).toBe(s)
    const n = empezar(s)
    expect(n.phase).toBe('pregunta')
    expect(n.tracks).toHaveLength(5)
    expect(n.clipUrl).toMatch(/^https:\/\//)
    expect(n.opciones).toHaveLength(4)
    expect(n.version).toBe(1)
  })

  it('answer válida suma 100 y pasa a resultados cuando todos responden', () => {
    const s = empezar(createInitialState([{ id: 'host1' }]))
    const n = reducer(s, { t: 'answer', opcion: 0 }, { isHost: false, peerId: 'host1' })
    expect(n.phase).toBe('resultados')
    expect(n.puntos['host1']).toBe(100)
  })

  it('ignora duplicados y opciones inválidas', () => {
    const s = empezar(createInitialState([{ id: 'a' }, { id: 'b' }]))
    const v0 = s.version
    expect(reducer(s, { t: 'answer', opcion: 9 }, { isHost: false, peerId: 'a' })).toBe(s)
    const s1 = reducer(s, { t: 'answer', opcion: 1 }, { isHost: false, peerId: 'a' })
    expect(s1.version).toBe(v0 + 1)
    expect(reducer(s1, { t: 'answer', opcion: 0 }, { isHost: false, peerId: 'a' })).toBe(s1)
  })

  it('respeta segundos personalizados y los limita a 5-300', () => {
    expect(createInitialState([{ id: 'h' }], { segundos: 30 }).timer).toBe(30)
    expect(createInitialState([{ id: 'h' }], { segundos: 9999 }).timer).toBe(300)
    expect(createInitialState([{ id: 'h' }], { segundos: 1 }).timer).toBe(5)
    let s = createInitialState([{ id: 'host1' }])
    s = reducer(s, { t: 'startGame', juegoId: 'hipster', config: { segundos: 45 }, tracks: [...TRACKS] }, host)
    expect(s.timer).toBe(45)
    expect(s.config.segundos).toBe(45)
  })

  it('tick del host cierra la ronda y next termina según tracks', () => {
    const s = empezar(createInitialState([{ id: 'host1' }]), [...TRACKS].slice(0, 4))
    let cur = reducer({ ...s, timer: 1 }, { t: 'tick' }, host)
    expect(cur.phase).toBe('resultados')
    for (let i = 0; i < 3; i++) {
      cur = reducer(cur, { t: 'next' }, host)
      expect(cur.phase).toBe('pregunta')
      expect(cur.ronda).toBe(i + 1)
      cur = reducer(cur, { t: 'answer', opcion: 0 }, { isHost: false, peerId: 'host1' })
      expect(cur.phase).toBe('resultados')
    }
    cur = reducer(cur, { t: 'next' }, host)
    expect(cur.phase).toBe('final')
  })
})

describe('listas', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('catálogo fijo con las 6 listas + clásicos', () => {
    expect(LISTAS.map((l) => l.id)).toEqual([
      'top-global',
      'top-espana',
      'top-japon',
      'top-rock',
      'top-pop',
      'top-reggaeton',
      'fiesta-clasicos'
    ])
  })

  it('prepararPartida descarta sin audio y rescata por búsqueda', async () => {
    const sinAudio = { id: 1, title: 'Tema X', artist: { name: 'Artista X' }, album: {}, preview: '' }
    const conAudio = {
      id: 2,
      title: 'Tema Y',
      artist: { name: 'Artista Y' },
      album: { title: 'A', cover_medium: 'http://img' },
      preview: 'https://clip.mp3'
    }
    const rescate = {
      id: 3,
      title: 'Tema X',
      artist: { name: 'Artista X' },
      album: { title: 'B' },
      preview: 'https://rescate.mp3'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/chart/0/tracks')) return { ok: true, json: async () => ({ data: [sinAudio, conAudio, sinAudio, conAudio, conAudio] }) }
        return { ok: true, json: async () => ({ data: [rescate] }) }
      })
    )
    const r = await prepararPartida('top-global', 5)
    expect(r.tracks).toHaveLength(5)
    for (const t of r.tracks) expect(t.previewUrl).toMatch(/^https:\/\//)
    expect(r.tracks.some((t) => t.previewUrl === 'https://rescate.mp3')).toBe(true)
  })

  it('prepararPartida falla si no hay suficientes con audio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })))
    await expect(prepararPartida('top-pop', 5)).rejects.toThrow(/insuficiente/i)
  })
})
