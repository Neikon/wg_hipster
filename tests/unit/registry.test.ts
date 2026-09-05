import { describe, expect, it } from 'vitest'
import { DEFAULT_GAME_ID, getGameModule } from '../../src/lib/game/registry'

describe('game registry', () => {
  it('resuelve el juego registrado y rechaza ids desconocidos', () => {
    expect(DEFAULT_GAME_ID).toBe('trivia')
    expect(getGameModule('trivia')?.id).toBe('trivia')
    expect(getGameModule('desconocido')).toBeNull()
  })
})
