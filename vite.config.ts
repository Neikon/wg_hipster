import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// @ts-ignore - test config para vitest
export default defineConfig({
  plugins: [svelte()],
  base: process.env.VITE_BASE || '/wg_hipster/',
  server: { port: 5173, host: true, strictPort: true },
  preview: { port: 4173, host: true, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
} as any)
