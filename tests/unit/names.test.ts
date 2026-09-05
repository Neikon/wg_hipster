import { describe, it, expect } from 'vitest'
import { assignName, sanitizeName } from '../../src/lib/utils/names'

describe('names', () => {
  it('assigns Jugador N', () => {
    expect(assignName(1)).toBe('Jugador 1')
    expect(assignName(20)).toBe('Jugador 20')
  })
  it('sanitizes too short returns null', () => {
    expect(sanitizeName('a')).toBeNull()
    expect(sanitizeName(' ')).toBeNull()
    expect(sanitizeName('')).toBeNull()
  })
  it('sanitizes ok trims', () => {
    expect(sanitizeName(' Ana ')).toBe('Ana')
    expect(sanitizeName('Bob_123')).toBe('Bob_123')
  })
  it('rejects invalid chars', () => {
    expect(sanitizeName('a!')).toBeNull()
  })
})
