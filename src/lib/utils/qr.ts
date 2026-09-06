import qrcode from 'qrcode-generator'

/**
 * QR para unirse a la sala. Con zona de silencio de 4 módulos (lo que exige
 * el estándar): el margen de createDataURL va en píxeles, así que son
 * 4 * celda. Sin ella muchos móviles no lo reconocen.
 */
export function qrParaSala(link: string): string {
  try {
    if (!link) return ''
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    const celda = 10
    return qr.createDataURL(celda, celda * 4)
  } catch {
    return ''
  }
}
