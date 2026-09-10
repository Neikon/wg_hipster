import { describe, it, expect } from 'vitest'
import { ANIMALES, ADJETIVOS, randomName, sanitizeName } from '../../src/lib/utils/names'

describe('names', () => {
  it('hay 20 animales y 20 adjetivos', () => {
    expect(ANIMALES.length).toBe(20)
    expect(ADJETIVOS.length).toBe(20)
  })
  it('randomName combina Animal + Adjetivo válidos y cortos', () => {
    for (let i = 0; i < 50; i++) {
      const n = randomName()
      const [animal, adj] = n.split(' ')
      expect(ANIMALES).toContain(animal)
      expect(ADJETIVOS).toContain(adj)
      expect(sanitizeName(n)).toBe(n)
      expect(n.length).toBeLessThanOrEqual(20)
    }
  })
  it('respeta excluidos y genera únicos en lote', () => {
    const usados: string[] = []
    for (let i = 0; i < 20; i++) {
      const n = randomName(usados)
      expect(usados).not.toContain(n)
      usados.push(n)
    }
    expect(randomName(['Zorro Veloz'])).not.toBe('Zorro Veloz')
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
