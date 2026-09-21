import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { Server as TrackerServer } from 'bittorrent-tracker'

/**
 * Sala P2P REAL con N jugadores: N Chromiums con WebRTC de verdad (Trystero
 * torrent strategy + la app sin modificar, mismo SyncNode de producción).
 *
 * La única pieza no productiva es la señalización: en vez de los trackers
 * públicos se usa un tracker BitTorrent local (bittorrent-tracker) inyectado
 * vía `?tracker=ws://127.0.0.1:PUERTO` (hook test-only en transport.ts).
 * Todo lo demás es idéntico a una fiesta real: STUN de producción, data
 * channels WebRTC entre todos los pares (malla completa), hellos,
 * requestState/stateSync, heartbeats y reintentos del SyncNode.
 *
 * Escenarios:
 * - escalonado: el host crea la sala y los invitados se unen con JOIN_GAP_MS
 *   entre cada uno, como en una fiesta donde el 4º móvil llega con la sala
 *   ya funcionando.
 * - lentos: como el escalonado, pero la segunda mitad de invitados lleva
 *   `?lagMs=&lossPct=` (móviles lentos con WiFi de fiesta: retardo con
 *   jitter + pérdida por receptor, timers reales de 1 s). Es el escenario
 *   que intenta reproducir el "limbo" del 4º jugador.
 * - público: como el escalonado pero contra los trackers públicos de
 *   producción (sin `?tracker=`). Solo bajo demanda: lento y dependiente
 *   de internet, pero es el camino de señalización 100 % real.
 * - envejecido: la sala vive AGE_MIN minutos con sus jugadores y LUEGO entra
 *   uno tardío, que debe converger. Caza la sala fantasma (fuga del offer
 *   pool de Trystero: a los minutos nadie anuncia). Opt-in por lento.
 *
 * Variables:
 *   E2E_PEERS="5,10,15,20"  tamaños de sala escalonados a probar
 *   E2E_BURST="15"          tamaños de sala en ráfaga ("" = ninguno)
 *   E2E_SLOW="8"            tamaños de sala con mitad lenta ("" = ninguno)
 *   E2E_PUBLIC=""           tamaños de sala vía trackers públicos ("" = ninguno)
 *   E2E_NET=""              si es "supabase", todos los escenarios usan esa
 *                         estrategia (requiere E2E_SUPA_URL y E2E_SUPA_KEY)
 *   E2E_SUPA_URL=""         URL del proyecto Supabase de pruebas
 *   E2E_SUPA_KEY=""         clave anon del proyecto Supabase de pruebas
 *   E2E_AGE_MIN=0           minutos de envejecido (0 = no probar); E2E_AGE_N=4
 *   E2E_TRACKER_PORT=18923  puerto ws del tracker local
 *   E2E_JOIN_GAP_MS=1200    pausa entre uniones escalonadas
 *   E2E_CONVERGE_MS=150000  tiempo máx. de convergencia por sala
 *   E2E_LAG_MS=600         retardo base (ms) de los peers lentos
 *   E2E_LOSS_PCT=15        % de mensajes perdidos por los peers lentos
 *   E2E_SLOW_HOST=1        el host también sufre lag/pérdida (peor caso)
 */

const parseList = (v: string | undefined, def: string): number[] =>
  (v ?? def)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 2)

const PEERS = parseList(process.env.E2E_PEERS, '5,10,15,20')
const BURST = parseList(process.env.E2E_BURST, '15')
const SLOW = parseList(process.env.E2E_SLOW, '8')
const PUBLIC = parseList(process.env.E2E_PUBLIC, '')
const AGE_MIN = Math.max(0, parseFloat(process.env.E2E_AGE_MIN || '0') || 0)
const AGE_N = Math.max(3, parseInt(process.env.E2E_AGE_N || '4', 10) || 4)
const LAG_MS = Math.max(0, parseInt(process.env.E2E_LAG_MS || '600', 10) || 0)
const LOSS_PCT = Math.min(90, Math.max(0, parseFloat(process.env.E2E_LOSS_PCT || '15') || 0))
/** "1" = el host también sufre lag/pérdida (peor caso: anfitrión con mal WiFi) */
const SLOW_HOST = process.env.E2E_SLOW_HOST === '1'
/** Estrategia supabase opt-in para todos los escenarios (con credenciales). */
const E2E_NET = process.env.E2E_NET === 'supabase' ? 'supabase' : ''
const E2E_SUPA_URL = process.env.E2E_SUPA_URL || ''
const E2E_SUPA_KEY = process.env.E2E_SUPA_KEY || ''
const SUPA_Q =
  E2E_NET === 'supabase' && E2E_SUPA_URL && E2E_SUPA_KEY
    ? `net=supabase&supaUrl=${encodeURIComponent(E2E_SUPA_URL)}&supaKey=${encodeURIComponent(E2E_SUPA_KEY)}`
    : ''

const TRACKER_PORT = parseInt(process.env.E2E_TRACKER_PORT || '18923', 10)
const JOIN_GAP_MS = parseInt(process.env.E2E_JOIN_GAP_MS || '1200', 10)
const CONVERGE_MS = parseInt(process.env.E2E_CONVERGE_MS || '150000', 10)

interface Escenario {
  n: number
  tag: string
  gap: number
  /** a partir de qué nº de invitado se aplica degradación (0 = nadie) */
  slowFrom: number
  lagMs: number
  lossPct: number
  /** true = trackers públicos de producción en vez del local */
  publico: boolean
  /** minutos que la sala vive antes de que entre el último invitado */
  ageMin: number
}

const ESCENARIOS: Escenario[] = [
  ...PEERS.map((n) => ({ n, tag: 'escalonado', gap: JOIN_GAP_MS, slowFrom: 0, lagMs: 0, lossPct: 0, publico: false, ageMin: 0 })),
  ...BURST.map((n) => ({ n, tag: 'ráfaga', gap: 0, slowFrom: 0, lagMs: 0, lossPct: 0, publico: false, ageMin: 0 })),
  ...SLOW.map((n) => ({ n, tag: 'lentos', gap: JOIN_GAP_MS, slowFrom: Math.floor(n / 2) + 1, lagMs: LAG_MS, lossPct: LOSS_PCT, publico: false, ageMin: 0 })),
  ...PUBLIC.map((n) => ({ n, tag: 'público', gap: JOIN_GAP_MS * 2, slowFrom: 0, lagMs: 0, lossPct: 0, publico: true, ageMin: 0 })),
  ...(AGE_MIN > 0 ? [{ n: AGE_N, tag: 'envejecido', gap: JOIN_GAP_MS, slowFrom: 0, lagMs: 0, lossPct: 0, publico: false, ageMin: AGE_MIN }] : [])
]

let tracker: InstanceType<typeof TrackerServer> | null = null

test.beforeAll(async () => {
  tracker = new TrackerServer({ udp: false, http: true, ws: true, stats: false })
  tracker.on('error', (e: unknown) => console.error('[tracker-test]', e))
  tracker.on('warning', () => {})
  await new Promise<void>((resolve, reject) => {
    const t = tracker as NonNullable<typeof tracker>
    t.once('error', (e: unknown) => reject(e))
    t.listen(TRACKER_PORT, '127.0.0.1')
    t.once('listening', () => resolve())
  })
})

test.afterAll(async () => {
  if (tracker) await new Promise<void>((resolve) => tracker!.close(() => resolve()))
  tracker = null
})

interface Jugador {
  name: string
  ctx: BrowserContext
  page: Page
  errors: string[]
}

function genSalaId(): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)]
  return s
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function leerConteo(p: Page): Promise<string | null> {
  const t = await p
    .getByText(/\/20 jugadores/)
    .first()
    .textContent()
    .catch(() => null)
  return t?.trim() ?? null
}

for (const esc of ESCENARIOS) {
  const { n, tag, gap } = esc
  test(`sala P2P real con ${n} jugadores (${tag}): todos ven a todos`, async ({ browser }, testInfo) => {
    test.setTimeout(Math.max(240_000, CONVERGE_MS + 120_000) + esc.ageMin * 60_000 + 60_000)
    const baseURL = testInfo.project.use.baseURL as string
    const salaId = genSalaId()
    const trackerQ = `tracker=${encodeURIComponent(`ws://127.0.0.1:${TRACKER_PORT}`)}`
    const jugadores: Jugador[] = []

    const abrir = async (name: string, extra: string, net: string): Promise<Jugador> => {
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      page.on('console', (m) => {
        // Los fallos de un tracker individual son ruido esperado en producción
        // (para eso hay 6 en lista); solo cuentan otros errores de consola.
        if (m.type() === 'error' && !/wss?:\/\/tracker/i.test(m.text())) {
          errors.push(`console: ${m.text().slice(0, 300)}`)
        }
      })
      const query = extra ? `${extra}&name=${encodeURIComponent(name)}` : `name=${encodeURIComponent(name)}`
      const netQ = net ? `&${net}` : ''
      const sigQ = esc.publico ? '' : `&${trackerQ}`
      const supaQ = SUPA_Q ? `&${SUPA_Q}` : ''
      await page.goto(`${baseURL}#/sala/${salaId}?${query}${sigQ}${netQ}${supaQ}`)
      const j: Jugador = { name, ctx, page, errors }
      jugadores.push(j)
      return j
    }

    const redDe = (i: number): string =>
      esc.slowFrom > 0 && i >= esc.slowFrom ? `lagMs=${esc.lagMs}&lossPct=${esc.lossPct}` : ''

    try {
      const hostNet = SLOW_HOST && esc.slowFrom > 0 ? `lagMs=${esc.lagMs}&lossPct=${esc.lossPct}` : ''
      const host = await abrir('Host', 'host=1', hostNet)
      await expect(host.page.getByText('1/20 jugadores')).toBeVisible({ timeout: 30_000 })
      if (!esc.publico) {
        // con tracker local hay 1/1; en público el nº varía (trackers vivos)
        await expect(host.page.getByText('Señalización: 1/1 trackers')).toBeVisible({ timeout: 30_000 })
      }

      if (gap <= 0) {
        // ráfaga: todos los invitados navegan a la vez
        await Promise.all(
          Array.from({ length: n - 1 }, (_, k) => abrir(`Jugador ${k + 2}`, '', redDe(k + 2)).then(() => undefined))
        )
      } else {
        // el último invitado puede llegar tarde (envejecido): la sala vive
        // ageMin minutos antes de que entre
        const tardio = esc.ageMin > 0 ? n : n + 1
        for (let i = 2; i < tardio; i++) {
          await sleep(gap)
          await abrir(`Jugador ${i}`, '', redDe(i))
        }
        if (esc.ageMin > 0) {
          await sleep(esc.ageMin * 60_000)
          await abrir(`Jugador ${n}`, '', redDe(n))
        }
      }

      // Esperar convergencia: cada página debe mostrar "n/20 jugadores".
      const objetivo = `${n}/20 jugadores`
      const fin = Date.now() + CONVERGE_MS
      let estado: Array<{ name: string; conteo: string | null }> = []
      for (;;) {
        estado = []
        for (const j of jugadores) estado.push({ name: j.name, conteo: await leerConteo(j.page) })
        if (estado.every((s) => s.conteo === objetivo)) break
        if (Date.now() > fin) break
        await sleep(2000)
      }

      const lentos = new Set(
        Array.from({ length: n - Math.max(esc.slowFrom, 2) + 1 }, (_, k) => `Jugador ${Math.max(esc.slowFrom, 2) + k}`)
      )
      const diagnostico =
        `sala ${salaId} con ${n} jugadores (${tag}, objetivo ${objetivo}` +
        (esc.ageMin > 0 ? `, envejecido ${esc.ageMin} min` : '') +
        (esc.slowFrom > 0 ? `, lentos desde Jugador ${esc.slowFrom}: lagMs=${esc.lagMs} lossPct=${esc.lossPct}` : '') +
        `):\n` +
        estado.map((s) => `  - ${s.name}${lentos.has(s.name) ? ' (lento)' : ''}: ${s.conteo ?? 'SIN CONTEO (¿limbo?)'}`).join('\n')

      for (const s of estado) {
        expect(s.conteo, `No converge.\n${diagnostico}`).toBe(objetivo)
      }

      // El anfitrión lista nominalmente a todos (no solo el conteo).
      for (const j of jugadores) {
        await expect(host.page.getByText(j.name, { exact: true }).first(), `Falta ${j.name}.\n${diagnostico}`).toBeVisible({
          timeout: 15_000
        })
      }

      // Sin errores JS en ninguna página.
      for (const j of jugadores) {
        expect(j.errors.slice(0, 10), `Errores JS en ${j.name}.\n${diagnostico}`).toEqual([])
      }
    } finally {
      for (const j of jugadores) await j.ctx.close().catch(() => {})
    }
  })
}
