import { describe, it, expect, afterEach } from 'vitest'
import {
  NET_KEY,
  SUPA_URL_KEY,
  SUPA_KEY_KEY,
  signalingStrategy,
  guardarEstrategia,
  supaConf,
  guardarSupa
} from '../../src/lib/net/signaling'

describe('signaling', () => {
  afterEach(() => {
    location.hash = '#/'
    localStorage.clear()
  })

  it('defecto supabase (proyecto común); query y guardado mandan', () => {
    expect(signalingStrategy()).toBe('supabase')
    location.hash = '#/sala/abc123?net=torrent'
    expect(signalingStrategy()).toBe('torrent')
    location.hash = '#/sala/abc123?net=telaraña'
    expect(signalingStrategy()).toBe('supabase')
    location.hash = '#/'
    expect(guardarEstrategia('torrent')).toBe(true)
    expect(signalingStrategy()).toBe('torrent')
    expect(localStorage.getItem(NET_KEY)).toBe('torrent')
  })

  it('supaConf cae al proyecto común sin nada configurado', () => {
    expect(supaConf()).toEqual({ url: expect.stringMatching(/^https:\/\//), key: expect.any(String) })
  })

  it('supaConf: query https persiste; la incompleta cae al proyecto común', () => {
    location.hash = '#/sala/abc123?supaUrl=' + encodeURIComponent('https://x.supabase.co') + '&supaKey=' + encodeURIComponent('clave-larga-123')
    expect(supaConf()).toEqual({ url: 'https://x.supabase.co', key: 'clave-larga-123' })
    location.hash = '#/'
    expect(supaConf()).toEqual({ url: 'https://x.supabase.co', key: 'clave-larga-123' })
    localStorage.clear()
    location.hash = '#/sala/abc123?supaUrl=' + encodeURIComponent('https://x.supabase.co')
    expect(supaConf()).toEqual({ url: expect.stringMatching(/^https:\/\//), key: expect.any(String) })
  })

  it('guardarSupa valida https y clave mínima', () => {
    expect(guardarSupa('http://x', 'clave-larga-123')).toBe(false)
    expect(guardarSupa('https://x.supabase.co', 'corta')).toBe(false)
    expect(guardarSupa('https://x.supabase.co', 'clave-larga-123')).toBe(true)
    expect(localStorage.getItem(SUPA_URL_KEY)).toBe('https://x.supabase.co')
    expect(localStorage.getItem(SUPA_KEY_KEY)).toBe('clave-larga-123')
  })
})
