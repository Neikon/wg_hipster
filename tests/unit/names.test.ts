import { describe, it, expect } from 'vitest'
import { ANIMALES, ADJETIVOS, EASTER_EGGS, randomName, sanitizeName } from '../../src/lib/utils/names'

describe('names', () => {
  it('hay 20 animales y 20 adjetivos', () => {
    expect(ANIMALES.length).toBe(20)
    expect(ADJETIVOS.length).toBe(20)
  })
  it('randomName da Animal+Adjetivo válidos y cortos, o easter egg', () => {
    for (let i = 0; i < 100; i++) {
      const n = randomName()
      if (EASTER_EGGS.includes(n)) continue
      const [animal, adj] = n.split(' ')
      expect(ANIMALES).toContain(animal)
      expect(ADJETIVOS).toContain(adj)
      expect(sanitizeName(n)).toBe(n)
      expect(n.length).toBeLessThanOrEqual(20)
    }
  })
  it('los easter eggs salen a veces y pasan sanitize', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 500; i++) vistos.add(randomName())
    expect([...vistos].some((n) => EASTER_EGGS.includes(n))).toBe(true)
    for (const e of EASTER_EGGS) expect(sanitizeName(e)).toBe(e)
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
