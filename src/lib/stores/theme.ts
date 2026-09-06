import { writable } from 'svelte/store'

export type Tema = 'light' | 'dark'
const CLAVE = 'wg_hipster:tema'

function inicial(): Tema {
  if (typeof document !== 'undefined') {
    const d = document.documentElement.dataset.theme
    if (d === 'light' || d === 'dark') return d
  }
  try {
    const g = localStorage.getItem(CLAVE)
    if (g === 'light' || g === 'dark') return g
  } catch {
    // sin almacenamiento: seguir al sistema
  }
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

function aplicar(t: Tema) {
  try {
    localStorage.setItem(CLAVE, t)
  } catch {
    // solo memoria
  }
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
}

export const theme = writable<Tema>(inicial())

export function toggleTheme() {
  theme.update((t) => {
    const n: Tema = t === 'light' ? 'dark' : 'light'
    aplicar(n)
    return n
  })
}
