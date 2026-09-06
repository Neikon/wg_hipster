import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

describe('theme store', () => {
  beforeEach(async () => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    vi.resetModules()
  })

  it('respeta lo guardado, si no el sistema, si no oscuro', async () => {
    const { theme } = await import('../../src/lib/stores/theme')
    // sin nada: oscuro por defecto en jsdom (sin matchMedia light)
    expect(get(theme)).toBe('dark')
  })

  it('toggle alterna y persiste en localStorage + DOM', async () => {
    const { theme, toggleTheme } = await import('../../src/lib/stores/theme')
    expect(get(theme)).toBe('dark')
    toggleTheme()
    expect(get(theme)).toBe('light')
    expect(localStorage.getItem('wg_hipster:tema')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    toggleTheme()
    expect(get(theme)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
