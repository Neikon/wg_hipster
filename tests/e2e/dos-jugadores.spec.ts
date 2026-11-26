import { conTracker, expect, simularMultimedia, test, usarIceLocal } from './fixtures'

test('sincroniza el juego P2P y lo continúa si sale el anfitrión', async ({ browser, baseURL, trackerUrl }) => {
  test.setTimeout(75_000)
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()

  try {
    await Promise.all([hostContext, guestContext].flatMap((context) => [
      usarIceLocal(context), simularMultimedia(context)
    ]))
    const host = await hostContext.newPage()
    const guest = await guestContext.newPage()
    await host.goto(`${baseURL}${conTracker('#/', trackerUrl)}`)
    await host.getByRole('button', { name: /Crear sala/ }).click()
    await expect(host.getByText('Señalización: 1/1 trackers')).toBeVisible()
    const invite = new URL(await host.getByLabel('Enlace de la sala').inputValue())
    const [room, suffix = ''] = invite.hash.split('?')
    const query = new URLSearchParams(suffix)
    expect(query.get('net')).toBe('torrent')
    expect(query.get('tracker')).toBe(trackerUrl)
    expect(query.get('anfitrion')).toMatch(/^[a-z\d]{20}$/i)
    query.set('name', 'Jugador 2')
    invite.hash = `${room}?${query}`
    await guest.goto(invite.href)

    await expect(host.getByText('Jugador 2', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(guest.getByText('2/20 jugadores')).toBeVisible()
    await host.getByLabel('Autoplay para todos').uncheck()
    await expect(guest.getByText(/Autoplay: desactivado/)).toBeVisible()

    await host.getByRole('button', { name: /Cargar lista/ }).click()
    await host.getByRole('button', { name: /Empezar hipster/ }).click()
    await expect(host.getByText(/¿Qué canción es\?/)).toBeVisible()
    await expect(guest.getByText(/¿Qué canción es\?/)).toBeVisible({ timeout: 10_000 })

    await guest.getByRole('button', { name: /^A\. / }).click()
    await expect(host.getByText('1/2 han respondido')).toBeVisible({ timeout: 10_000 })
    await expect(guest.getByText('1/2 han respondido')).toBeVisible()
    await host.close()
    // Al cerrar sin «Salir», WebRTC detecta la pérdida cuando expira la conexión.
    await expect(guest.getByRole('heading', { name: 'Resultados' })).toBeVisible({ timeout: 50_000 })
    await guest.getByRole('button', { name: 'Siguiente' }).click()
    await expect(guest.getByText(/Ronda 2\/5/)).toBeVisible()
    await guest.getByText('Compartir sala', { exact: true }).click()
    const updatedInvite = new URL(await guest.getByLabel('Enlace de la sala').inputValue())
    const successor = new URLSearchParams(updatedInvite.hash.split('?')[1]).get('anfitrion')
    expect(successor).toMatch(/^[a-z\d]{20}$/i)
    expect(successor).not.toBe(query.get('anfitrion'))
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})
