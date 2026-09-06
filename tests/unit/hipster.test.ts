import { describe, it, expect, vi, afterEach } from 'vitest'
import { createInitialState, margenPara, pistasPara, reducer } from '../../src/lib/game/hipster/engine'
import { TRACKS, mostrarAlbum, pistaTitulo } from '../../src/lib/game/hipster/tracks'
import { LISTAS, LISTA_FALLBACK, buscarEnItunes, getLista, mapTrackDeezer, prepararPartida, prepararPartidaBusqueda } from '../../src/lib/game/hipster/listas'
import type { HipsterTrack } from '../../src/lib/game/hipster/types'

const host = { isHost: true, peerId: 'host1' }
const guest = { isHost: false, peerId: 'guest1' }

function empezar(
  s: ReturnType<typeof createInitialState>,
  tracks: HipsterTrack[] = [...TRACKS],
  pool: HipsterTrack[] = [...TRACKS]
) {
  return reducer(s, { t: 'startGame', juegoId: 'hipster', tracks, pool }, host)
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

  it('autoplayDefault: ON de serie, solo el host lo cambia', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(s.autoplayDefault).toBe(true)
    // invitado no puede
    expect(reducer(s, { t: 'setAutoplayDefault', valor: false }, guest)).toBe(s)
    // host sí, con version+1; repetir valor no versiona
    const off = reducer(s, { t: 'setAutoplayDefault', valor: false }, host)
    expect(off.autoplayDefault).toBe(false)
    expect(off.version).toBe(s.version + 1)
    expect(reducer(off, { t: 'setAutoplayDefault', valor: false }, host)).toBe(off)
    // restart lo conserva
    const jugando = empezar(createInitialState([{ id: 'host1' }]))
    const apagado = reducer(jugando, { t: 'setAutoplayDefault', valor: false }, host)
    const re = reducer(reducer(apagado, { t: 'answer', opcion: apagado.respuestaCorrecta }, { isHost: false, peerId: 'host1' }), { t: 'next' }, host)
    void re
    const lob = reducer(apagado, { t: 'restart' }, host)
    expect(lob.phase).toBe('lobby')
    expect(lob.autoplayDefault).toBe(false)
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
          tracks: [{ titulo: 'X', artista: 'Y', previewUrl: '', trackId: 1, album: '', artworkUrl: '', anio: null }]
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

  it('baraja las opciones: la correcta varía y es determinista', () => {
    const a = empezar(createInitialState([{ id: 'host1' }]))
    const b = empezar(createInitialState([{ id: 'host1' }]))
    // mismo estado inicial → mismo orden (reducer puro)
    expect(a.opciones).toEqual(b.opciones)
    expect(a.respuestaCorrecta).toBe(b.respuestaCorrecta)
    // la correcta no está siempre en A: varía entre rondas
    const posiciones = new Set<number>()
    let cur = a
    posiciones.add(cur.respuestaCorrecta)
    for (let i = 0; i < 4; i++) {
      cur = reducer(cur, { t: 'answer', opcion: cur.respuestaCorrecta }, { isHost: false, peerId: 'host1' })
      cur = reducer(cur, { t: 'next' }, host)
      if (cur.phase === 'pregunta') posiciones.add(cur.respuestaCorrecta)
    }
    expect(posiciones.size).toBeGreaterThan(1)
    // la opción correcta contiene el título del track de la ronda
    expect(a.opciones[a.respuestaCorrecta]).toContain(TRACKS[0].titulo)
  })

  it('las opciones muestran solo el título (sin delatar al artista)', () => {
    const s = empezar(createInitialState([{ id: 'host1' }]))
    for (const op of s.opciones) {
      expect(op).not.toContain('–')
    }
    expect(s.opciones[s.respuestaCorrecta]).toBe(TRACKS[0].titulo)
  })

  it('desempata con artista si dos temas comparten título', () => {
    const dup: HipsterTrack[] = [1, 2, 3, 4].map((i) => ({
      trackId: i,
      titulo: i < 3 ? 'Mismo' : `Otro ${i}`,
      artista: `Art ${i}`,
      album: '',
      previewUrl: `https://clip${i}.m4a`,
      artworkUrl: '',
      anio: 2000
    }))
    const s = empezar(createInitialState([{ id: 'host1' }]), dup, dup)
    // la correcta (track 1, título duplicado) lleva artista para distinguirse
    expect(s.opciones[s.respuestaCorrecta]).toContain('Art 1')
    expect(new Set(s.opciones).size).toBe(4)
  })

  it('los distractores salen del pool completo, no del corte de rondas', () => {
    const extra: HipsterTrack[] = [6, 7, 8].map((i) => ({
      trackId: 1000 + i,
      titulo: `Extra ${i}`,
      artista: `Artista ${i}`,
      album: '',
      previewUrl: `https://extra${i}.m4a`,
      artworkUrl: '',
      anio: 2000 + i
    }))
    const corte = [...TRACKS].slice(0, 4)
    const pool = [...corte, ...extra]
    const s = empezar(createInitialState([{ id: 'host1' }]), corte, pool)
    expect(s.pool).toHaveLength(7)
    // en 4 rondas con corte de 4, algún distractor debe venir del extra
    const etiquetasCorte = new Set(corte.map((t) => t.titulo))
    let hayDeFuera = false
    let cur = s
    for (let i = 0; i < 4; i++) {
      if (cur.phase !== 'pregunta') break
      if (cur.opciones.some((o) => !etiquetasCorte.has(o))) hayDeFuera = true
      cur = reducer(cur, { t: 'answer', opcion: cur.respuestaCorrecta }, { isHost: false, peerId: 'host1' })
      cur = reducer(cur, { t: 'next' }, host)
    }
    expect(hayDeFuera).toBe(true)
  })

  it('sin pool válido usa las rondas como distractores', () => {
    const s = reducer(
      createInitialState([{ id: 'host1' }]),
      { t: 'startGame', juegoId: 'hipster', tracks: [...TRACKS] },
      host
    )
    expect(s.phase).toBe('pregunta')
    expect(s.opciones).toHaveLength(4)
  })

  it('baraja las opciones: la correcta varía y es determinista', () => {
    const a = empezar(createInitialState([{ id: 'host1' }]))
    const b = empezar(createInitialState([{ id: 'host1' }]))
    // mismo estado inicial → mismo orden (reducer puro)
    expect(a.opciones).toEqual(b.opciones)
    expect(a.respuestaCorrecta).toBe(b.respuestaCorrecta)
    // la correcta no está siempre en A: varía entre rondas
    const posiciones = new Set<number>()
    let cur = a
    posiciones.add(cur.respuestaCorrecta)
    for (let i = 0; i < 4; i++) {
      cur = reducer(cur, { t: 'answer', opcion: cur.respuestaCorrecta }, { isHost: false, peerId: 'host1' })
      cur = reducer(cur, { t: 'next' }, host)
      if (cur.phase === 'pregunta') posiciones.add(cur.respuestaCorrecta)
    }
    expect(posiciones.size).toBeGreaterThan(1)
    // la opción correcta contiene el título del track de la ronda
    expect(a.opciones[a.respuestaCorrecta]).toContain(TRACKS[0].titulo)
  })

  it('answer válida suma 100 y pasa a resultados cuando todos responden', () => {
    const s = empezar(createInitialState([{ id: 'host1' }]))
    const n = reducer(s, { t: 'answer', opcion: s.respuestaCorrecta }, { isHost: false, peerId: 'host1' })
    expect(n.phase).toBe('resultados')
    expect(n.puntos['host1']).toBe(100)
  })

  it('fallar no suma puntos', () => {
    const s = empezar(createInitialState([{ id: 'host1' }]))
    const erronea = ([0, 1, 2, 3] as const).find((i) => i !== s.respuestaCorrecta)!
    const n = reducer(s, { t: 'answer', opcion: erronea }, { isHost: false, peerId: 'host1' })
    expect(n.phase).toBe('resultados')
    expect(n.puntos['host1']).toBe(0)
  })

  it('modo año: vale ±5, rechaza fuera de rango y exige años en tracks', () => {
    const conAnio = [...TRACKS]
    const base = createInitialState([{ id: 'host1' }], { modo: 'anio' })
    expect(base.config.modo).toBe('anio')
    const s = reducer(
      base,
      { t: 'startGame', juegoId: 'hipster', config: { modo: 'anio' }, tracks: conAnio, pool: conAnio },
      host
    )
    expect(s.phase).toBe('pregunta')
    expect(s.opciones).toEqual([])
    const anio = s.respuestaCorrecta as number
    expect(anio).toBeGreaterThanOrEqual(1900)

    // dentro del margen suma, en el borde también, fuera no
    const ok = reducer(s, { t: 'answer', opcion: anio + 5 }, { isHost: false, peerId: 'host1' })
    expect(ok.phase).toBe('resultados')
    expect(ok.puntos['host1']).toBe(100)

    let s2 = reducer(
      createInitialState([{ id: 'a' }, { id: 'b' }]),
      { t: 'startGame', juegoId: 'hipster', config: { modo: 'anio' }, tracks: conAnio, pool: conAnio },
      host
    )
    s2 = reducer(s2, { t: 'answer', opcion: (s2.respuestaCorrecta as number) + 6 }, { isHost: false, peerId: 'a' })
    expect(s2.phase).toBe('pregunta')
    expect(reducer(s2, { t: 'answer', opcion: 1700 }, { isHost: false, peerId: 'b' })).toBe(s2)

    // modo por defecto sigue siendo título y rechaza años como opción
    const t = empezar(createInitialState([{ id: 'host1' }]))
    expect(t.config.modo).toBe('titulo')
    expect(reducer(t, { t: 'answer', opcion: 1975 }, { isHost: false, peerId: 'host1' })).toBe(t)

    // sin año en algún track no arranca en modo año
    const sinAnio = conAnio.map((x, i) => (i === 0 ? { ...x, anio: null } : x))
    expect(
      reducer(base, { t: 'startGame', juegoId: 'hipster', config: { modo: 'anio' }, tracks: sinAnio, pool: sinAnio }, host)
    ).toBe(base)
  })

  it('dificultad: margen de año y pista de título', () => {
    expect(margenPara('facil')).toBe(10)
    expect(margenPara('normal')).toBe(5)
    expect(margenPara('dificil')).toBe(2)
    expect(pistaTitulo('Blinding Lights')).toBe('B_______ L_____')
    expect(pistaTitulo('Waka Waka (This Time for Africa)')).toBe('W___ W___ (____ T___ f__ A_____)')

    // difícil: a 3 años ya no vale
    const base = createInitialState([{ id: 'host1' }], { modo: 'anio', dificultad: 'dificil' })
    const s = reducer(
      base,
      { t: 'startGame', juegoId: 'hipster', config: { modo: 'anio', dificultad: 'dificil' }, tracks: [...TRACKS], pool: [...TRACKS] },
      host
    )
    expect(s.config.dificultad).toBe('dificil')
    const n = reducer(s, { t: 'answer', opcion: (s.respuestaCorrecta as number) + 3 }, { isHost: false, peerId: 'host1' })
    expect(n.puntos['host1']).toBe(0)

    // fácil: a 8 años sí vale
    const f = reducer(
      createInitialState([{ id: 'h2' }], { modo: 'anio', dificultad: 'facil' }),
      { t: 'startGame', juegoId: 'hipster', config: { modo: 'anio', dificultad: 'facil' }, tracks: [...TRACKS], pool: [...TRACKS] },
      { isHost: true, peerId: 'h2' }
    )
    const nf = reducer(f, { t: 'answer', opcion: (f.respuestaCorrecta as number) + 8 }, { isHost: false, peerId: 'h2' })
    expect(nf.puntos['h2']).toBe(100)

    // dificultad inválida → normal
    expect(createInitialState([{ id: 'h' }], { dificultad: 'extrema' as never }).config.dificultad).toBe('normal')
  })

  it('pistas: presets por dificultad y saneado', () => {
    expect(pistasPara('facil')).toEqual(['titulo', 'artista', 'anio', 'album'])
    expect(pistasPara('normal')).toEqual(['artista'])
    expect(pistasPara('dificil')).toEqual([])
    expect(createInitialState([{ id: 'h' }]).config.pistas).toEqual(['artista'])
    expect(
      createInitialState([{ id: 'h' }], { pistas: ['album', 'anio', 'invalida' as never] }).config.pistas
    ).toEqual(['album', 'anio'])
    const s = empezar(createInitialState([{ id: 'host1' }], { pistas: ['album'] }))
    expect(s.config.pistas).toEqual(['album'])
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
      cur = reducer(cur, { t: 'answer', opcion: cur.respuestaCorrecta }, { isHost: false, peerId: 'host1' })
      expect(cur.phase).toBe('resultados')
    }
    cur = reducer(cur, { t: 'next' }, host)
    expect(cur.phase).toBe('final')
  })
})

describe('listas', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('catálogo fijo con las 6 listas (clásicos solo como fallback)', () => {
    expect(LISTAS.map((l) => l.id)).toEqual([
      'top-global',
      'top-espana',
      'top-japon',
      'top-rock',
      'top-pop',
      'top-reggaeton'
    ])
    expect(getLista(LISTA_FALLBACK)?.fuente).toBe('fixture')
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

  it('buscarEnItunes respeta el filtro por tipo', async () => {
    const llamadas: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        llamadas.push(url)
        if (url.includes('entity=album'))
          return {
            ok: true,
            json: async () => ({
              results: [{ collectionId: 11, collectionName: 'Álbum 80s', artistName: 'Varios', artworkUrl100: 'https://img/100x100bb.jpg' }]
            })
          }
        return { ok: true, json: async () => ({ results: [{ artistId: 22, artistName: 'Queen', primaryGenreName: 'Rock' }] }) }
      })
    )
    const r = await buscarEnItunes('80s', ['album', 'artista'])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ tipo: 'album', id: 11, nombre: 'Álbum 80s' })
    expect(r[1]).toMatchObject({ tipo: 'artista', id: 22, nombre: 'Queen' })
    expect(await buscarEnItunes('x')).toEqual([])

    llamadas.length = 0
    const soloAlbum = await buscarEnItunes('80s', ['album'])
    expect(soloAlbum).toHaveLength(1)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0]).toContain('entity=album')
  })

  it('prepararPartidaBusqueda arma rondas desde un álbum', async () => {
    const song = (id: number) => ({
      wrapperType: 'track',
      kind: 'song',
      trackId: id,
      trackName: `Tema ${id}`,
      artistName: 'Queen',
      collectionName: 'Álbum',
      previewUrl: `https://clip${id}.m4a`,
      artworkUrl100: 'https://img/100x100bb.jpg'
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('entity=song')) return { ok: true, json: async () => ({ results: [{ wrapperType: 'collection' }, song(1), song(2), song(3), song(4), song(5)] }) }
        return { ok: true, json: async () => ({ results: [] }) }
      })
    )
    const r = await prepararPartidaBusqueda({ tipo: 'album', id: 11, nombre: 'Álbum', subtitulo: '', artworkUrl: '' }, 5)
    expect(r.tracks).toHaveLength(5)
    for (const t of r.tracks) expect(t.previewUrl).toMatch(/^https:\/\//)
  })

  it('mapTrackDeezer mapea tracks de playlist', () => {
    const m = mapTrackDeezer({
      id: 7,
      title: 'Tema P',
      artist: { name: 'Art P' },
      album: { title: 'Alb', cover_medium: 'https://cover' },
      preview: 'https://clip.mp3',
      release_date: '2005-11-21'
    })
    expect(m).toMatchObject({ trackId: 7, titulo: 'Tema P', artista: 'Art P', previewUrl: 'https://clip.mp3', anio: 2005 })
    expect(mapTrackDeezer({ id: 8, title: 'Sin audio', artist: { name: 'X' }, preview: '' })?.previewUrl).toBe('')
    expect(mapTrackDeezer({ id: 9, title: 'Sin fecha', artist: { name: 'X' }, preview: 'https://clip.mp3' })?.anio).toBeNull()
    expect(mapTrackDeezer(null)).toBeNull()
  })

  it('el fixture trae año en todos los temas', () => {
    for (const t of TRACKS) expect(t.anio).toBeGreaterThanOrEqual(1900)
  })

  it('mostrarAlbum oculta el álbum si regala el título', () => {
    // caso del pantallazo: single "Jolene" con álbum "Jolene"
    expect(mostrarAlbum({ titulo: 'Jolene', album: 'Jolene' })).toBe(false)
    expect(mostrarAlbum({ titulo: 'Jolene', album: 'Jolene - Single' })).toBe(false)
    expect(mostrarAlbum({ titulo: 'Blinding Lights', album: 'Blinding Lights (Remix) - Single' })).toBe(false)
    expect(mostrarAlbum({ titulo: 'X', album: '' })).toBe(false)
    expect(mostrarAlbum({ titulo: 'Blinding Lights', album: 'After Hours' })).toBe(true)
    expect(mostrarAlbum({ titulo: 'Up', album: 'Listen Up!' })).toBe(true)
  })
})
