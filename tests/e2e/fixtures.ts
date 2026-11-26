import { test as base, type BrowserContext } from '@playwright/test'
import { Server as TrackerServer } from 'bittorrent-tracker'

export { expect } from '@playwright/test'

export const test = base.extend<{}, { trackerPort: number; trackerUrl: string }>({
  trackerPort: [0, { scope: 'worker', option: true }],
  trackerUrl: [async ({ trackerPort }, use) => {
    const tracker = new TrackerServer({ udp: false, http: true, ws: true, stats: false })
    await new Promise<void>((resolve, reject) => {
      tracker.once('error', reject)
      tracker.listen(trackerPort, '127.0.0.1', resolve)
    })
    try {
      const address = tracker.http?.address()
      if (!address || typeof address === 'string') throw new Error('Tracker local sin puerto')
      await use(`ws://127.0.0.1:${address.port}`)
    } finally {
      await new Promise<void>((resolve) => tracker.close(resolve))
    }
  }, { scope: 'worker' }],
})

export function conTracker(hash: string, trackerUrl: string): string {
  const sep = hash.includes('?') ? '&' : '?'
  return `${hash}${sep}tracker=${encodeURIComponent(trackerUrl)}`
}

// Los navegadores del test comparten máquina. WebRTC real, candidatos locales.
export async function usarIceLocal(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) {
        super({ ...config, iceServers: [] })
      }
    }
  })
}

export async function simularMultimedia(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/(?:[^/]+\.mzstatic\.com|img)\//, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    headers: { 'access-control-allow-origin': '*' },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#de661a"/></svg>'
  }))
  await context.route(/\.(?:m4a|mp3)(?:\?|$)/, (route) => route.fulfill({ status: 204 }))
}
