import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  TURN_API_KEY,
  TURN_CACHE_KEY,
  readTurnServers,
  turnApiUrl,
  guardarTurnApi,
  refreshTurnServers
} from '../../src/lib/net/turn'

const BUENA = JSON.stringify([{ urls: 'turn:relevo:80', username: 'u', credential: 'p' }])

describe('turn', () => {
  afterEach(() => {
    location.hash = '#/'
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('sin nada no hay TURN (comportamiento de antes)', () => {
    expect(readTurnServers()).toEqual([])
    expect(turnApiUrl()).toBeNull()
  })

  it('?turn= con JSON válido manda; inválido se ignora', () => {
    location.hash = '#/sala/abc123?turn=' + encodeURIComponent(BUENA)
    expect(readTurnServers()).toEqual([{ urls: 'turn:relevo:80', username: 'u', credential: 'p' }])
    location.hash = '#/sala/abc123?turn=no-json'
    expect(readTurnServers()).toEqual([])
    location.hash = '#/sala/abc123?turn=' + encodeURIComponent(JSON.stringify([{ sinUrls: 1 }]))
    expect(readTurnServers()).toEqual([])
  })

  it('acepta forma {iceServers:[...]} y normaliza credential a string', () => {
    location.hash =
      '#/sala/abc123?turn=' +
      encodeURIComponent(JSON.stringify({ iceServers: [{ urls: ['turn:a:80', 'turns:a:443'], username: 'u', credential: 12345 }] }))
    expect(readTurnServers()).toEqual([{ urls: ['turn:a:80', 'turns:a:443'], username: 'u', credential: '12345' }])
  })

  it('caché local como fallback', () => {
    localStorage.setItem(TURN_CACHE_KEY, BUENA)
    expect(readTurnServers()).toEqual(JSON.parse(BUENA))
    localStorage.setItem(TURN_CACHE_KEY, 'roto{')
    expect(readTurnServers()).toEqual([])
  })

  it('turnApiUrl solo https (query o guardada)', () => {
    location.hash = '#/sala/abc123?turnApi=' + encodeURIComponent('http://x/cred')
    expect(turnApiUrl()).toBeNull()
    location.hash = '#/sala/abc123?turnApi=' + encodeURIComponent('https://x/cred?apiKey=k')
    expect(turnApiUrl()).toBe('https://x/cred?apiKey=k')
    location.hash = '#/'
    expect(turnApiUrl()).toBeNull()
    expect(guardarTurnApi('https://x/cred?apiKey=k')).toBe(true)
    expect(turnApiUrl()).toBe('https://x/cred?apiKey=k')
    expect(guardarTurnApi('ftp://x')).toBe(false)
  })

  it('refreshTurnServers pide, valida y cachea', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => BUENA }) as any)
    vi.stubGlobal('fetch', fetchMock)
    localStorage.setItem(TURN_API_KEY, 'https://x/cred?apiKey=k')
    const list = await refreshTurnServers()
    expect(list).toEqual(JSON.parse(BUENA))
    expect(localStorage.getItem(TURN_CACHE_KEY)).toBe(BUENA)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refreshTurnServers falla a [] sin romper', async () => {
    // sin API: ni llama a fetch
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => BUENA }) as any)
    vi.stubGlobal('fetch', fetchMock)
    expect(await refreshTurnServers()).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    // http error
    localStorage.setItem(TURN_API_KEY, 'https://x/cred')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, text: async () => '' }) as any))
    expect(await refreshTurnServers()).toEqual([])
    // json inválido
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => 'roto{' }) as any))
    expect(await refreshTurnServers()).toEqual([])
    // red caída
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await refreshTurnServers()).toEqual([])
  })
})
