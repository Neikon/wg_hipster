import { describe, it, expect } from 'vitest'
import { generateSalaId } from '../../src/lib/utils/id'

describe('generateSalaId', () => {
  it('generates 6 chars alphanum lowercase', () => {
    const id = generateSalaId()
    expect(id).toMatch(/^[a-z0-9]{6}$/)
  })
  it('generates unique ids', () => {
    const ids = new Set(Array.from({length:20}, ()=>generateSalaId()))
    expect(ids.size).toBeGreaterThan(15)
  })
})
