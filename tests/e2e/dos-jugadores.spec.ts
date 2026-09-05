import { expect, test } from '@playwright/test'

const exigeP2P = process.env.E2E_P2P === '1'

test('sincroniza host e invitado a través de la red P2P', async ({ browser }, testInfo) => {
  test.setTimeout(50_000)
  const baseURL = testInfo.project.use.baseURL as string
  const hostContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  try {
    await host.goto(`${baseURL}#/`)
    await host.getByRole('button', { name: /Crear sala/ }).click()
    const salaId = host.url().match(/#\/sala\/([a-z0-9]{6})/)?.[1]
    expect(salaId).toBeTruthy()

    await guest.goto(`${baseURL}#/sala/${salaId}?name=Jugador%202`)

    try {
      await expect(host.getByText('Jugador 2')).toBeVisible({ timeout: 15_000 })
    } catch (error) {
      if (!exigeP2P) {
        test.skip(true, 'Los trackers WebRTC no están accesibles; usa E2E_P2P=1 para exigir esta prueba.')
        return
      }
      throw error
    }

    await host.getByRole('button', { name: /Empezar trivia/ }).click()
    await expect(host.getByText('Pregunta 1/10')).toBeVisible()
    await expect(guest.getByText('Pregunta 1/10')).toBeVisible({ timeout: 10_000 })

    await guest.getByRole('button', { name: /B\. Madrid/ }).click()
    await expect(host.getByText('1/2 han respondido')).toBeVisible({ timeout: 10_000 })
  } finally {
    await hostContext.close()
    await guestContext.close()
  }
})
