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

  it('prepararPartida enriquece el chart por lookup y descarta sin audio', async () => {
    const rss = {
      feed: {
        entry: [
          { id: { attributes: { 'im:id': '1' } }, 'im:name': { label: 'Tema A' }, 'im:artist': { label: 'Art A' } },
          { id: { attributes: { 'im:id': '2' } }, 'im:name': { label: 'Tema B' }, 'im:artist': { label: 'Art B' } },
          { id: { attributes: { 'im:id': '3' } }, 'im:name': { label: 'Tema C' }, 'im:artist': { label: 'Art C' } },
          { id: { attributes: { 'im:id': '4' } }, 'im:name': { label: 'Tema D' }, 'im:artist': { label: 'Art D' } },
          { id: { attributes: { 'im:id': '5' } }, 'im:name': { label: 'Tema E' }, 'im:artist': { label: 'Art E' } }
        ]
      }
    }
    const conAudio = (id: string) => ({
      results: [
        {
          trackId: Number(id),
          trackName: `Tema ${id}`,
          artistName: `Art ${id}`,
          collectionName: 'Album',
          previewUrl: `https://clip${id}.m4a`,
          artworkUrl100: 'https://img/100x100bb.jpg'
        }
      ]
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rss/')) return { ok: true, json: async () => rss }
        if (url.includes('lookup?id=2')) return { ok: true, json: async () => ({ results: [{}] }) }
        if (url.includes('/search?')) return { ok: true, json: async () => conAudio('9') }
        const m = url.match(/lookup\?id=(\d+)/)
        return { ok: true, json: async () => conAudio(m![1]) }
      })
    )
    const r = await prepararPartida('top-espana', 5)
    expect(r.tracks).toHaveLength(5)
    for (const t of r.tracks) expect(t.previewUrl).toMatch(/^https:\/\//)
    // el id 2 se rescató por búsqueda (trackId 9)
    expect(r.tracks.some((t) => t.trackId === 9)).toBe(true)
  })

  it('prepararPartida falla claro sin red o sin audio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    await expect(prepararPartida('top-pop', 5)).rejects.toThrow(/descargar/i)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/rss/'))
          return {
            ok: true,
            json: async () => ({
              feed: { entry: [{ id: { attributes: { 'im:id': '1' } }, 'im:name': { label: 'A' }, 'im:artist': { label: 'B' } }] }
            })
          }
        return { ok: true, json: async () => ({ results: [], resultCount: 0 }) }
      })
    )
    await expect(prepararPartida('top-pop', 5)).rejects.toThrow(/insuficiente/i)
  })
})
