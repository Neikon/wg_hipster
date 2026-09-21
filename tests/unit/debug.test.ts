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

describe('debug captura', () => {
  it('colapsa repeticiones seguidas (×N)', async () => {
    const { debugLog: dl, installConsoleCapture } = await import('../../src/lib/net/debug')
    dl.enable({ sala: 'x' })
    const stop = installConsoleCapture()
    try {
      console.warn('aviso repetido')
      console.warn('aviso repetido')
      console.warn('otro')
      expect(dl.tail(2)).toContain('aviso repetido (×2)')
      expect(dl.tail(1)).toContain('otro')
      stop()
      console.warn('aviso repetido')
      expect(dl.tail(1)).toContain('otro')
    } finally {
      stop()
    }
  })

  it('disable() silencia el log', async () => {
    const { debugLog: dl } = await import('../../src/lib/net/debug')
    dl.enable({ sala: 'x' })
    dl.disable()
    dl.log('sys', 'nada')
    expect(dl.tail(10)).not.toContain('nada')
    dl.enable({ sala: 'x' })
  })
})

describe('debug reanuncio y sonda', () => {
  it('necesitaReanuncio: solo tras 10 s; host solo si está solo', async () => {
    const { necesitaReanuncio } = await import('../../src/lib/net/debug')
    expect(necesitaReanuncio(5000, false, 1)).toBe(false)
    expect(necesitaReanuncio(15000, false, 1)).toBe(true)
    expect(necesitaReanuncio(15000, true, 1)).toBe(true)
    expect(necesitaReanuncio(15000, true, 3)).toBe(false)
    expect(necesitaReanuncio(10000, false, 1)).toBe(true)
  })

  it('installBroadcastProbe registra solo broadcast y restaura', async () => {
    const { debugLog: dl, installBroadcastProbe } = await import('../../src/lib/net/debug')
    dl.enable({ sala: 'x' })
    const llamadas: string[] = []
    const fakeFetch = (async (input: any) => {
      llamadas.push(String(input))
      if (String(input).includes('/realtime/v1/api/broadcast')) return { status: 202 } as any
      return { status: 200 } as any
    }) as any
    const realFetch = (globalThis as any).fetch
    ;(globalThis as any).fetch = fakeFetch
    const stop = installBroadcastProbe()
    try {
      await (globalThis as any).fetch('https://a.test/realtime/v1/api/broadcast', { method: 'POST' })
      await (globalThis as any).fetch('https://a.test/otra', {})
      expect(dl.tail(5)).toContain('broadcast POST -> 202')
      expect(dl.tail(5)).not.toContain('otra')
      // fallo de red se registra y se propaga
      ;(globalThis as any).fetch = (async () => {
        throw new Error('caído')
      }) as any
      const stop2 = installBroadcastProbe()
      await expect((globalThis as any).fetch('https://a.test/realtime/v1/api/broadcast', {})).rejects.toThrow('caído')
      expect(dl.tail(3)).toContain('broadcast POST FALLO')
      stop2()
    } finally {
      stop()
      ;(globalThis as any).fetch = realFetch
      dl.enable({ sala: 'x' })
    }
  })
})
