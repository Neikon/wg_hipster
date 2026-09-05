export function generateSalaId(): string {
  // 6 chars alfanum minúsculas
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0,6)
}
