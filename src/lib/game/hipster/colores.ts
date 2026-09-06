import { writable } from 'svelte/store'

/**
 * Color dinámico estilo M3 (inspirado en `@material/material-color-utilities`
 * y `m3e`, pero sin dependencias): extrae el color de la carátula con Canvas,
 * lo adapta al tema claro/oscuro y garantiza contraste WCAG AA.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface Tinte {
  /** Fondo teñido de la sala durante la ronda (hex). */
  fondo: string
  /** Acento para play/slider/respuestas (hex, con contraste). */
  acento: string
  /** Texto sobre el acento (hex). */
  sobreAcento: string
}

export const tinteActual = writable<Tinte | null>(null)

const cache = new Map<string, Tinte | null>()

export function rgbAHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function hexARgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(v, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function canal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminancia relativa WCAG (0–1). */
export function luminancia({ r, g, b }: RGB): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Ratio de contraste WCAG (1–21). */
export function ratioContraste(a: RGB, b: RGB): number {
  const [claro, oscuro] = luminancia(a) >= luminancia(b) ? [a, b] : [b, a]
  return (luminancia(claro) + 0.05) / (luminancia(oscuro) + 0.05)
}

function mezclar(a: RGB, b: RGB, t: number): RGB {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

/**
 * Ajusta `fg` hacia negro/blanco hasta alcanzar el ratio mínimo sobre `bg`.
 * Si ni el negro ni el blanco llegan, devuelve el que más se acerque.
 */
export function asegurarContraste(fg: RGB, bg: RGB, min = 4.5): RGB {
  if (ratioContraste(fg, bg) >= min) return fg
  const negro: RGB = { r: 0, g: 0, b: 0 }
  const blanco: RGB = { r: 255, g: 255, b: 255 }
  const haciaNegro: RGB[] = []
  const haciaBlanco: RGB[] = []
  for (let i = 1; i <= 10; i++) {
    haciaNegro.push(mezclar(fg, negro, i / 10))
    haciaBlanco.push(mezclar(fg, blanco, i / 10))
  }
  const okNegro = haciaNegro.find((c) => ratioContraste(c, bg) >= min)
  const okBlanco = haciaBlanco.find((c) => ratioContraste(c, bg) >= min)
  const candidatos = [okNegro, okBlanco].filter(Boolean) as RGB[]
  if (candidatos.length) {
    // el que menos se aleja del original
    const dist = (c: RGB) => Math.abs(c.r - fg.r) + Math.abs(c.g - fg.g) + Math.abs(c.b - fg.b)
    return candidatos.sort((x, y) => dist(x) - dist(y))[0]
  }
  return ratioContraste(negro, bg) >= ratioContraste(blanco, bg) ? negro : blanco
}

function saturacion({ r, g, b }: RGB): number {
  const mx = Math.max(r, g, b) / 255
  const mn = Math.min(r, g, b) / 255
  return mx === 0 ? 0 : (mx - mn) / mx
}

/**
 * Deduce dominante (fondo) y acento desde píxeles: el acento es el tono
 * saturado más presente (como el source-color de M3), el dominante el
 * promedio ponderado. Función pura para poder testearla sin canvas.
 */
export function coloresDesdePixeles(px: RGB[]): { dominante: RGB; acento: RGB } {
  const utiles = px.filter((p) => {
    const l = luminancia(p)
    return l > 0.01 && l < 0.98
  })
  const base = utiles.length ? utiles : [{ r: 128, g: 128, b: 128 }]
  const total = { r: 0, g: 0, b: 0 }
  for (const p of base) {
    total.r += p.r
    total.g += p.g
    total.b += p.b
  }
  const dominante = { r: total.r / base.length, g: total.g / base.length, b: total.b / base.length }
  // cubos de 4 bits por canal, puntuados por presencia × saturación
  const cubos = new Map<string, { n: number; acc: RGB }>()
  for (const p of base) {
    const k = `${p.r >> 4},${p.g >> 4},${p.b >> 4}`
    const c = cubos.get(k) ?? { n: 0, acc: { r: 0, g: 0, b: 0 } }
    c.n++
    c.acc.r += p.r
    c.acc.g += p.g
    c.acc.b += p.b
    cubos.set(k, c)
  }
  let mejor: RGB = dominante
  let mejorPts = -1
  for (const { n, acc } of cubos.values()) {
    const medio = { r: acc.r / n, g: acc.g / n, b: acc.b / n }
    const pts = n * (0.2 + saturacion(medio))
    if (pts > mejorPts) {
      mejorPts = pts
      mejor = medio
    }
  }
  return { dominante, acento: mejor }
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('imagen no cargable'))
    img.src = url
  })
}

/**
 * Tinte para una carátula: fondo adaptado al tema + acento con contraste AA.
 * `tema` es 'light' | 'dark'. Cacheado por trackId. null si falla.
 */
export async function tinteDeCaratula(
  artworkUrl: string,
  trackId: number,
  tema: 'light' | 'dark'
): Promise<Tinte | null> {
  if (!artworkUrl) return null
  const claveCache = `${trackId}:${tema}`
  const hit = cache.get(claveCache)
  if (hit !== undefined) return hit
  try {
    const img = await cargarImagen(artworkUrl)
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('sin canvas 2d')
    ctx.drawImage(img, 0, 0, 16, 16)
    const data = ctx.getImageData(0, 0, 16, 16).data
    const px: RGB[] = []
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      px.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
    }
    const { dominante, acento } = coloresDesdePixeles(px)
    // Fondo: el dominante acercado al tema (pastel en claro, profundo en oscuro)
    const fondo =
      tema === 'light'
        ? mezclar(dominante, { r: 255, g: 255, b: 255 }, 0.72)
        : mezclar(dominante, { r: 0, g: 0, b: 0 }, 0.62)
    // Acento con contraste AA sobre el fondo (UI: 3:1)
    const acentoOk = asegurarContraste(acento, fondo, 3)
    // Texto sobre el acento (4.5:1): blanco o negro, ajustado si hace falta
    const blanco: RGB = { r: 255, g: 255, b: 255 }
    const negro: RGB = { r: 0, g: 0, b: 0 }
    const sobre = ratioContraste(blanco, acentoOk) >= ratioContraste(negro, acentoOk) ? blanco : negro
    const tinte: Tinte = {
      fondo: rgbAHex(fondo),
      acento: rgbAHex(acentoOk),
      sobreAcento: rgbAHex(asegurarContraste(sobre, acentoOk, 4.5))
    }
    cache.set(claveCache, tinte)
    return tinte
  } catch {
    cache.set(claveCache, null)
    return null
  }
}

export function limpiarCacheTinte() {
  cache.clear()
}

function componenteAHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/** Acepta #rgb, #rrggbb, rgb() y rgba() (ignora alfa). */
export function parseColor(s: string): RGB {
  const t = s.trim().toLowerCase()
  if (t.startsWith('#')) return hexARgb(t)
  const m = t.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const [r, g, b] = m[1].split(',').slice(0, 3).map((x) => Number(x.trim()))
    if ([r, g, b].every(Number.isFinite)) return { r, g, b }
  }
  return { r: 128, g: 128, b: 128 }
}

/** Mezcla dos colores cualesquiera (hex o rgb()) y devuelve hex. */
export function mezclarHex(a: string, b: string, t: number): string {
  const ca = parseColor(a)
  const cb = parseColor(b)
  const k = Math.max(0, Math.min(1, t))
  return `#${componenteAHex(ca.r + (cb.r - ca.r) * k)}${componenteAHex(ca.g + (cb.g - ca.g) * k)}${componenteAHex(ca.b + (cb.b - ca.b) * k)}`
}

/**
 * Texto para un fondo dado (hex o rgb()): blanco o negro, el que dé más
 * contraste, ajustado hasta el mínimo WCAG. Cada superficie teñida necesita
 * el suyo: el del acento no vale para la tarjeta y viceversa.
 */
export function textoSobre(fondoHex: string, min = 4.5): string {
  const fondo = parseColor(fondoHex)
  const blanco: RGB = { r: 255, g: 255, b: 255 }
  const negro: RGB = { r: 0, g: 0, b: 0 }
  const base = ratioContraste(blanco, fondo) >= ratioContraste(negro, fondo) ? blanco : negro
  return rgbAHex(asegurarContraste(base, fondo, min))
}
