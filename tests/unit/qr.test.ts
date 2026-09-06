import { describe, it, expect } from 'vitest'
import qrcode from 'qrcode-generator'
import { qrParaSala } from '../../src/lib/utils/qr'

/** Ancho/alto de un data URL GIF (descriptor de pantalla lógica, bytes 6-9 LE). */
function gifSize(dataUrl: string): { w: number; h: number } {
  const b64 = dataUrl.split(',')[1]
  const buf = Buffer.from(b64, 'base64')
  return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
}

describe('qr de sala', () => {
  it('genera GIF con zona de silencio (margen 4 módulos)', () => {
    const link = 'https://neikon.github.io/wg_hipster/#/sala/abc123'
    const url = qrParaSala(link)
    expect(url.startsWith('data:image/gif')).toBe(true)
    const ref = qrcode(0, 'M')
    ref.addData(link)
    ref.make()
    const modulos = ref.getModuleCount()
    // dimensión = módulos*celda + 2*margen = módulos*10 + 80 (4 módulos por lado)
    expect(gifSize(url)).toEqual({ w: modulos * 10 + 80, h: modulos * 10 + 80 })
  })

  it('devuelve vacío sin enlace', () => {
    expect(qrParaSala('')).toBe('')
  })
})
