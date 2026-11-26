import { describe, it, expect, afterEach } from 'vitest'
import {
  NET_KEY,
  SUPA_URL_KEY,
  SUPA_KEY_KEY,
  signalingStrategy,
  guardarEstrategia,
  supaConf,
  guardarSupa,
  signalingParams,
  guestRecovery
} from '../../src/lib/net/signaling'

const project = { url: 'https://example.supabase.co', key: 'sb_publishable_example_public_key' }

describe('signaling', () => {
  afterEach(() => {
    location.hash = '#/'
    localStorage.clear()
  })

  it('usa trackers sin configuración y respeta la estrategia del enlace', () => {
    expect(signalingStrategy()).toBe('torrent')
    expect(guardarSupa(project.url, project.key)).toBe(true)
    expect(guardarEstrategia('supabase')).toBe(true)
    expect(signalingStrategy()).toBe('supabase')
    location.hash = '#/sala/abc123?net=torrent'
    expect(signalingStrategy()).toBe('torrent')
    expect(localStorage.getItem(NET_KEY)).toBe('supabase')
  })

  it('ignora una preferencia Supabase antigua sin proyecto', () => {
    guardarEstrategia('supabase')
    expect(signalingStrategy()).toBe('torrent')
    expect(supaConf()).toBeNull()
    location.hash = '#/sala/abc123?net=supabase'
    expect(signalingStrategy()).toBe('supabase')
    expect(supaConf()).toBeNull()
  })

  it('lee el proyecto público de la invitación sin modificar preferencias', () => {
    guardarSupa(project.url, project.key)
    const invitado = { url: 'https://another.supabase.co', key: 'sb_publishable_another_key' }
    location.hash = '#/sala/abc123?' + signalingParams('supabase', invitado).toString()
    expect(supaConf()).toEqual(invitado)
    expect(localStorage.getItem(SUPA_URL_KEY)).toBe(project.url)
    expect(localStorage.getItem(SUPA_KEY_KEY)).toBe(project.key)
    location.hash = '#/sala/abc123?net=supabase&supaUrl=https://broken.supabase.co'
    expect(supaConf()).toBeNull()
  })

  it('no admite ni comparte claves secretas ni URLs con credenciales', () => {
    const secret = 'sb_secret_never_share_this'
    expect(guardarSupa(project.url, secret)).toBe(false)
    expect(guardarSupa('https://user:password@example.supabase.co', project.key)).toBe(false)
    expect(guardarSupa('http://example.supabase.co', project.key)).toBe(false)
    expect(signalingParams('supabase', { ...project, key: secret }).has('supaKey')).toBe(false)
    expect([...signalingParams('torrent', project)]).toEqual([['net', 'torrent']])
  })

  it('permite la clave JWT pública anon y rechaza service_role', () => {
    const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`
    expect(guardarSupa(project.url, jwt('anon'))).toBe(true)
    expect(guardarSupa(project.url, jwt('service_role'))).toBe(false)
  })

  it('recarga tras el tiempo total aunque un reintento acabe de empezar', () => {
    expect(guestRecovery(12000, 12000, 0, false)).toBe('retry')
    expect(guestRecovery(30000, 1000, 0, false)).toBe('reload')
    expect(guestRecovery(30000, 1000, 1, false)).toBe('reload')
    expect(guestRecovery(30000, 12000, 2, true)).toBe('failed')
    expect(guestRecovery(5000, 5000, 0, true)).toBe('retry')
  })
})
