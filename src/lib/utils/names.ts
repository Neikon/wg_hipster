/** Base para nombres aleatorios de fiesta: 20 animales × 20 adjetivos. */
export const ANIMALES: readonly string[] = [
  'Zorro', 'Búho', 'Lince', 'Pulpo', 'Erizo', 'Koala', 'Panda', 'Tigre',
  'Lobo', 'Oso', 'Gato', 'Mapache', 'Nutria', 'Pingüino', 'Camaleón',
  'Halcón', 'Jirafa', 'Canguro', 'Topo', 'Ardilla'
]

/** Adjetivos invariables en género para no romper la concordancia. */
export const ADJETIVOS: readonly string[] = [
  'Veloz', 'Feliz', 'Audaz', 'Fugaz', 'Gris', 'Salvaje', 'Valiente',
  'Elegante', 'Gigante', 'Marrón', 'Feroz', 'Ágil', 'Enorme', 'Azul',
  'Verde', 'Rosa', 'Breve', 'Leve', 'Cortés', 'Voraz'
]

/**
 * Nombre aleatorio "Animal Adjetivo" (p. ej. "Zorro Veloz") para quien entra
 * sin elegir nombre. `excluidos` evita duplicados dentro de la sala; con 400
 * combinaciones y 20 jugadores como máximo, el reintento termina siempre.
 */
export function randomName(excluidos: readonly string[] = []): string {
  const libres = new Set(excluidos)
  for (let intento = 0; intento < 50; intento++) {
    const nombre = `${ANIMALES[Math.floor(Math.random() * ANIMALES.length)]} ${ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)]}`
    if (!libres.has(nombre)) return nombre
  }
  // Cinturón y tirantes: sufijo si la sala estuviera llenísima de duplicados.
  return `${ANIMALES[Math.floor(Math.random() * ANIMALES.length)]} ${ADJETIVOS[Math.floor(Math.random() * ADJETIVOS.length)]} ${Math.floor(Math.random() * 100)}`
}
export function sanitizeName(raw: string): string | null {
  const t = raw.trim().slice(0, 20)
  if (t.length < 2) return null
  // permitir letras, números, espacios, guion y underscore
  if (!/^[\p{L}\p{N} _-]+$/u.test(t)) return null
  return t
}
