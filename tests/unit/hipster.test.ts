import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../../src/lib/game/hipster/engine'
import { TRACKS } from '../../src/lib/game/hipster/tracks'

const host = { isHost: true, peerId: 'host1' }
const guest = { isHost: false, peerId: 'guest1' }

describe('hipster engine', () => {
  it('estado inicial en lobby con 5 rondas fixture', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(s.phase).toBe('lobby')
    expect(s.gameId).toBe('hipster')
    expect(s.version).toBe(0)
    expect(TRACKS).toHaveLength(5)
    for (const t of TRACKS) expect(t.previewUrl).toMatch(/^https:\/\//)
  })

  it('solo el host puede empezar', () => {
    const s = createInitialState([{ id: 'host1' }])
    expect(reducer(s, { t: 'startGame', juegoId: 'hipster' }, guest)).toBe(s)
    const n = reducer(s, { t: 'startGame', juegoId: 'hipster' }, host)
    expect(n.phase).toBe('pregunta')
    expect(n.clipUrl).toMatch(/^https:\/\//)
    expect(n.opciones).toHaveLength(4)
    expect(n.version).toBe(1)
  })

  it('answer válida suma 100 y pasa a resultados cuando todos responden', () => {
    let s = createInitialState([{ id: 'host1' }])
    s = reducer(s, { t: 'startGame', juegoId: 'hipster' }, host)
    const n = reducer(s, { t: 'answer', opcion: 0 }, { isHost: false, peerId: 'host1' })
    expect(n.phase).toBe('resultados')
    expect(n.puntos['host1']).toBe(100)
  })

  it('ignora duplicados y opciones inválidas', () => {
    let s = createInitialState([{ id: 'a' }, { id: 'b' }])
    s = reducer(s, { t: 'startGame', juegoId: 'hipster' }, host)
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
    s = reducer(s, { t: 'startGame', juegoId: 'hipster', config: { segundos: 45 } }, host)
    expect(s.timer).toBe(45)
    expect(s.config.segundos).toBe(45)
  })

  it('tick del host cierra la ronda y next avanza / termina en 5', () => {
    let s = createInitialState([{ id: 'host1' }])
    s = reducer(s, { t: 'startGame', juegoId: 'hipster' }, host)
    s = { ...s, timer: 1 }
    s = reducer(s, { t: 'tick' }, host)
    expect(s.phase).toBe('resultados')
    for (let i = 0; i < 4; i++) {
      s = reducer(s, { t: 'next' }, host)
      expect(s.phase).toBe('pregunta')
      expect(s.ronda).toBe(i + 1)
      s = reducer(s, { t: 'answer', opcion: 0 }, { isHost: false, peerId: 'host1' })
      expect(s.phase).toBe('resultados')
    }
    s = reducer(s, { t: 'next' }, host)
    expect(s.phase).toBe('final')
  })
})
