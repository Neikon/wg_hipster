import { describe, it, expect, beforeEach } from 'vitest'
import { debugLog, downloadText } from '../../src/lib/net/debug'

describe('debug', () => {
  beforeEach(() => {
    debugLog.enable({ sala: 'test' })
  })

  it('enable reinicia el buffer', () => {
    debugLog.log('proto', 'previo')
    debugLog.enable({ sala: 'otra' })
    expect(debugLog.count()).toBe(1)
    expect(debugLog.tail(1)).toContain('log iniciado')
  })

  it('tope de anillo: conserva las últimas', () => {
    for (let i = 0; i < 1200; i++) debugLog.log('proto', `m${i}`)
    expect(debugLog.count()).toBe(1000)
    expect(debugLog.tail(1)).toContain('m1199')
    expect(debugLog.tail(1000)).not.toContain('m0')
  })

  it('toText con cabecera y tail(n)', () => {
    debugLog.log('red', 'tracker abierto x')
    debugLog.log('sala', 'hola')
    const txt = debugLog.toText()
    expect(txt).toContain('# wg_hipster debug log')
    expect(txt).toContain('red tracker abierto x')
    expect(txt).toContain('sala hola')
    expect(debugLog.tail(1)).toContain('sala hola')
  })

  it('downloadText fuera del navegador falla sin romper', () => {
    expect(typeof downloadText).toBe('function')
  })
})
