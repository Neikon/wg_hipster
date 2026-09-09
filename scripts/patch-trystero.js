/**
 * Parchea node_modules/trystero (torrent strategy) contra la fuga de
 * RTCPeerConnection que convierte salas en fantasmas.
 *
 * Causa: cada announce crea 10 ofertas (RTCPeerConnection vivas) por tracker
 * y las guarda en un mapa que se REEMPLAZA en el siguiente announce sin
 * destruir la hornada anterior; las respuestas tampoco borran su entrada.
 * ~40 conexiones fugadas por ciclo y pestaña: a los minutos el navegador
 * deja de poder anunciar (sockets abiertos, enjambre vacío, malla viva).
 *
 * Parche: (1) destruir la hornada anterior al anunciar de nuevo;
 * (2) borrar del mapa la oferta al usarla en una respuesta, para no destruir
 * una conexión ya establecida.
 *
 * Idempotente y estricto: si el contenido esperado de trystero cambia
 * (p. ej. actualización), falla con error para revisarlo a mano.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'node_modules', 'trystero', 'package.json')
const file = join(dirname(pkgPath), 'src', 'torrent.js')
const MARK = 'PARCHE wg_hipster anti-fuga offers'

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (pkg.version !== '0.20.1') {
  console.error(`[patch-trystero] versión inesperada de trystero: ${pkg.version} (esperada 0.20.1). Revisa el parche a mano.`)
  process.exit(1)
}
if (!existsSync(file)) {
  console.error(`[patch-trystero] no existe ${file}`)
  process.exit(1)
}
let src = readFileSync(file, 'utf8')
if (src.includes(MARK)) {
  console.log('[patch-trystero] ya aplicado, nada que hacer')
  process.exit(0)
}

const anchorInit = '  subscribe: (client, rootTopic, _, onMessage, getOffers) => {\n    const {url} = client\n'
const anchorAnnounce = '    const announce = async () => {\n      const offers = fromEntries('
const anchorAnswer = '        } else if (data.answer) {\n          const offer = offers[data.offer_id]\n'
for (const [name, a] of [['subscribe', anchorInit], ['announce', anchorAnnounce], ['answer', anchorAnswer]]) {
  if (!src.includes(a)) {
    console.error(`[patch-trystero] ancla '${name}' no encontrada: el código de trystero cambió. Revisa el parche a mano.`)
    process.exit(1)
  }
}

src = src.replace(
  anchorInit,
  '  subscribe: (client, rootTopic, _, onMessage, getOffers) => {\n' +
    '    const {url} = client\n' +
    `    // ${MARK}: hornada anterior de ofertas (se destruye al re-anunciar)\n` +
    '    let prevOffers = {}\n'
)
src = src.replace(
  anchorAnnounce,
  '    const announce = async () => {\n' +
    `      // ${MARK}: cada announce fugaba 10 RTCPeerConnection vivas por\n` +
    '      // tracker (mapa reemplazado sin destruir + respuestas sin borrar).\n' +
    '      // A los minutos el navegador deja de anunciar: sala fantasma.\n' +
    '      Object.values(prevOffers).forEach(entry => {\n' +
    '        try {\n' +
    '          entry.peer.destroy()\n' +
    '        } catch {}\n' +
    '      })\n' +
    '      prevOffers = {}\n' +
    '      const offers = fromEntries('
)
const anchorBuilt = '        ])\n      )\n'
if (!src.includes(anchorBuilt)) {
  console.error('[patch-trystero] ancla de cierre del mapa no encontrada. Revisa el parche a mano.')
  process.exit(1)
}
src = src.replace(anchorBuilt, '        ])\n      )\n      prevOffers = offers\n')
src = src.replace(
  anchorAnswer,
  '        } else if (data.answer) {\n' +
    '          const offer = offers[data.offer_id]\n' +
    `          // ${MARK}: la oferta usada pasa a la malla viva; borrarla\n` +
    '          // del mapa para que el próximo announce no la destruya.\n' +
    '          delete offers[data.offer_id]\n'
)

writeFileSync(file, src)
console.log('[patch-trystero] parche aplicado a trystero/torrent.js')
