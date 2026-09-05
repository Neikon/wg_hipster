export function assignName(index: number): string {
  return `Jugador ${index}`
}
export function sanitizeName(raw: string): string | null {
  const t = raw.trim().slice(0, 20)
  if (t.length < 2) return null
  // permitir letras, números, espacios, guion y underscore
  if (!/^[\p{L}\p{N} _-]+$/u.test(t)) return null
  return t
}
