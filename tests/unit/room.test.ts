import { describe, it, expect } from 'vitest'
import { electNewHost, isRoomFull } from '../../src/lib/net/room'

describe('room helpers', () => {
  it('elects next peer when host leaves', () => {
    expect(electNewHost(['a','b','c'], new Set(['b','c']))).toBe('b')
    expect(electNewHost(['a','b','c'], new Set(['c']))).toBe('c')
  })
  it('returns null if none connected', () => {
    expect(electNewHost(['a'], new Set())).toBeNull()
  })
  it('returns first if host still connected', () => {
    expect(electNewHost(['a','b'], new Set(['a','b']))).toBe('a')
  })
  it('isRoomFull checks limit 20', () => {
    expect(isRoomFull(20)).toBe(true)
    expect(isRoomFull(19)).toBe(false)
    expect(isRoomFull(21)).toBe(true)
  })
})
