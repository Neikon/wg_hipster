import { describe, it, expect } from 'vitest'
import { createInitialState, reducer } from '../../src/lib/game/trivia/engine'

describe('trivia engine', () => {
  const peers = [{id:'a',name:'p1',joinTime:1},{id:'b',name:'p2',joinTime:2}]
  it('startGame moves to pregunta', () => {
    let s = createInitialState(peers)
    expect(s.phase).toBe('lobby')
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    expect(s.phase).toBe('pregunta')
    expect(s.preguntaIdx).toBe(0)
    expect(s.timer).toBe(20)
    expect(s.config).toEqual({ numPreguntas: 10, segundos: 20, categoria: 'todas' })
  })
  it('non-host cannot start', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:false,peerId:'b'})
    expect(s.phase).toBe('lobby')
  })
  it('answer records', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    s = reducer(s,{t:'answer', opcion:2} as any,{isHost:true,peerId:'b'})
    expect(s.respuestas['b']).toBe(2)
  })
  it('prevents double answer', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    s = reducer(s,{t:'answer', opcion:1} as any,{isHost:false,peerId:'b'})
    const v = s.version
    s = reducer(s,{t:'answer', opcion:2} as any,{isHost:false,peerId:'b'})
    expect(s.respuestas['b']).toBe(1)
    expect(s.version).toBe(v)
  })
  it('tick counts down and moves to resultados when zero', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    // answer correct for b (pregunta 0 correcta=1)
    s = reducer(s,{t:'answer', opcion:1} as any,{isHost:false,peerId:'b'})
    s = reducer(s,{t:'answer', opcion:0} as any,{isHost:false,peerId:'a'})
    // 20 ticks
    for(let i=0;i<20;i++) s = reducer(s,{t:'tick'} as any,{isHost:true,peerId:'a'})
    expect(s.phase).toBe('resultados')
    expect(s.puntuaciones['b']).toBe(100)
    expect(s.puntuaciones['a']).toBe(0)
  })
  it('nextQuestion advances or finishes', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    for(let i=0;i<20;i++) s = reducer(s,{t:'tick'} as any,{isHost:true,peerId:'a'})
    expect(s.phase).toBe('resultados')
    s = reducer(s,{t:'nextQuestion'} as any,{isHost:true,peerId:'a'})
    expect(s.phase).toBe('pregunta')
    expect(s.preguntaIdx).toBe(1)
  })
  it('pasa a resultados en cuanto responden todos, sin esperar al timer', () => {
    let s = createInitialState(peers)
    s = reducer(s,{t:'startGame'} as any,{isHost:true,peerId:'a'})
    // responde solo uno: sigue en pregunta
    s = reducer(s,{t:'answer', opcion:1} as any,{isHost:false,peerId:'b'})
    expect(s.phase).toBe('pregunta')
    // responde el último: pasa a resultados con puntos (pregunta 0 correcta=1)
    s = reducer(s,{t:'answer', opcion:1} as any,{isHost:true,peerId:'a'})
    expect(s.phase).toBe('resultados')
    expect(s.puntuaciones['a']).toBe(100)
    expect(s.puntuaciones['b']).toBe(100)
  })

  it('respeta una configuración corta de principio a fin', () => {
    let s = createInitialState(peers)
    s = reducer(s, {
      t: 'startGame',
      juegoId: 'trivia',
      config: { numPreguntas: 2, segundos: 5, categoria: 'todas' }
    }, { isHost: true, peerId: 'a' })

    expect(s.config).toEqual({ numPreguntas: 2, segundos: 5, categoria: 'todas' })
    expect(s.timer).toBe(5)

    for (const peerId of ['a', 'b']) {
      s = reducer(s, { t: 'answer', opcion: 1 }, { isHost: peerId === 'a', peerId })
    }
    expect(s.phase).toBe('resultados')
    s = reducer(s, { t: 'nextQuestion' }, { isHost: true, peerId: 'a' })
    expect(s.preguntaIdx).toBe(1)
    expect(s.timer).toBe(5)

    for (const peerId of ['a', 'b']) {
      s = reducer(s, { t: 'answer', opcion: 1 }, { isHost: peerId === 'a', peerId })
    }
    s = reducer(s, { t: 'nextQuestion' }, { isHost: true, peerId: 'a' })
    expect(s.phase).toBe('final')
  })

  it('limita el número de preguntas a las disponibles en la categoría', () => {
    let s = createInitialState(peers)
    s = reducer(s, {
      t: 'startGame',
      config: { numPreguntas: 10, segundos: 1, categoria: 'deportes' }
    }, { isHost: true, peerId: 'a' })
    expect(s.config).toEqual({ numPreguntas: 1, segundos: 5, categoria: 'deportes' })
  })

  it('reinicia conservando la configuración y una versión creciente', () => {
    let s = createInitialState(peers)
    s = reducer(s, {
      t: 'startGame',
      config: { numPreguntas: 2, segundos: 5, categoria: 'geografia' }
    }, { isHost: true, peerId: 'a' })
    const startedVersion = s.version

    s = reducer(s, { t: 'restart' }, { isHost: true, peerId: 'a' })
    expect(s.phase).toBe('lobby')
    expect(s.config).toEqual({ numPreguntas: 2, segundos: 5, categoria: 'geografia' })
    expect(s.version).toBe(startedVersion + 1)
  })
})
