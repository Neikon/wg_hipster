import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// @ts-ignore - test config para vitest
export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE || '/wg_hipster/',
  define: {
    // Identidad del despliegue: el log debug la incluye para saber si una
    // pestaña corre código viejo cacheado.
    __BUILD_ID__: JSON.stringify(process.env.VITE_BUILD_ID || new Date().toISOString().slice(0, 16).replace('T', ' '))
  },
  server: { port: 5173, host: true, strictPort: true },
  preview: { port: 4173, host: true, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
} as any)
