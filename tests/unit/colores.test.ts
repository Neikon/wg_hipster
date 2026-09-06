import { describe, it, expect } from 'vitest'
import {
  rgbAHex,
  hexARgb,
  parseColor,
  mezclarHex,
  textoSobre,
  luminancia,
  ratioContraste,
  asegurarContraste,
  coloresDesdePixeles
} from '../../src/lib/game/hipster/colores'

describe('color dinámico', () => {
  it('hex/rgb redondos', () => {
    expect(rgbAHex({ r: 255, g: 0, b: 16 })).toBe('#ff0010')
    expect(hexARgb('#ff0010')).toEqual({ r: 255, g: 0, b: 16 })
  })

  it('parseColor y mezclarHex', () => {    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30 })
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30 })
    expect(mezclarHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mezclarHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
  })

  it('ratios WCAG conocidos', () => {
    const negro = { r: 0, g: 0, b: 0 }
    const blanco = { r: 255, g: 255, b: 255 }
    expect(ratioContraste(negro, blanco)).toBeCloseTo(21, 0)
    expect(ratioContraste(negro, negro)).toBe(1)
    // gris medio sobre blanco ≈ 4:1 (no llega a AA normal)
    expect(ratioContraste({ r: 119, g: 119, b: 119 }, blanco)).toBeGreaterThan(4)
    expect(ratioContraste({ r: 119, g: 119, b: 119 }, blanco)).toBeLessThan(4.5)
  })

  it('asegurarContraste sube hasta el mínimo', () => {
    const blanco = { r: 255, g: 255, b: 255 }
    const amarillo = { r: 255, g: 235, b: 59 }
    const tenue = { r: 200, g: 200, b: 200 }
    const ajustado = asegurarContraste(amarillo, blanco, 4.5)
    expect(ratioContraste(ajustado, blanco)).toBeGreaterThanOrEqual(4.5)
    // si ya cumple, no toca
    expect(asegurarContraste({ r: 0, g: 0, b: 0 }, blanco, 4.5)).toEqual({ r: 0, g: 0, b: 0 })
    expect(asegurarContraste(tenue, blanco, 3)).not.toEqual(tenue)
  })

  it('coloresDesdePixeles: acento saturado, dominante promedio', () => {
    const rojo = { r: 220, g: 20, b: 20 }
    const gris = { r: 120, g: 120, b: 120 }
    const px = [...Array(30).fill(gris), ...Array(70).fill(rojo)]
    const { dominante, acento } = coloresDesdePixeles(px)
    // dominante tira al promedio ponderado (rojizo)
    expect(dominante.r).toBeGreaterThan(dominante.b)
    // acento: el tono saturado mayoritario
    expect(acento.r).toBeGreaterThan(180)
    expect(acento.g).toBeLessThan(60)
  })

  it('coloresDesdePixeles con todo filtrado usa fallback', () => {
    const { dominante } = coloresDesdePixeles([
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 }
    ])
    expect(dominante).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('textoSobre: cada superficie lleva su texto (AA 4.5)', () => {
    // tarjeta oscura como la del pantallazo → blanco
    expect(textoSobre('#2a2530')).toBe('#ffffff')
    // tarjeta clara → negro
    expect(textoSobre('#f2e8d5')).toBe('#000000')
    // el resultado siempre cumple AA contra su fondo
    for (const fondo of ['#2a2530', '#f2e8d5', '#7c3aed', '#808080', 'rgb(34, 38, 47)']) {
      expect(ratioContraste(parseColor(textoSobre(fondo)), parseColor(fondo))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('regresión: el negro del acento no vale sobre tarjeta oscura', () => {
    // El bug: texto del acento (negro sobre violeta claro) reutilizado en
    // respuestas con fondo de tarjeta oscuro → ilegible.
    const tarjetaOscura = '#2a2530'
    const textoAcento = '#000000'
    expect(ratioContraste(parseColor(textoAcento), parseColor(tarjetaOscura))).toBeLessThan(4.5)
    // el texto propio de la tarjeta sí cumple
    expect(ratioContraste(parseColor(textoSobre(tarjetaOscura)), parseColor(tarjetaOscura))).toBeGreaterThanOrEqual(4.5)
  })
})
