import { test, expect } from '@playwright/test'

test('landing renderiza y crear sala lleva al lobby', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('#/')
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()
  await page.getByRole('button', { name: /Crear sala/ }).click()

  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)
  await expect(page.getByRole('heading', { name: /Sala/ })).toBeVisible()

  // el enlace compartido apunta a este juego (no al template) y salir vuelve a la landing
  const link = await page.locator('input[readonly]').first().inputValue()
  expect(link).toContain('/wg_hipster/#/sala/')
  expect(link).not.toContain('wg_template')

  expect(errors).toEqual([])
})

test('al empezar el juego se ocultan los elementos del lobby', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)

  // lobby: enlace para compartir y lista de jugadores visibles
  await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Jugadores/ })).toBeVisible()

  // el QR se genera al pedirlo
  await page.getByRole('button', { name: /Ver QR/ }).click()
  await expect(page.getByAltText(/QR para unirse/)).toBeVisible()

  // el anfitrión carga la lista y empieza la partida
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()

  // juego: clip visible a pantalla completa, sin elementos de lobby
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Jugadores/ })).toBeHidden()
  await expect(page.getByRole('heading', { name: /Cambiar nombre/ })).toBeHidden()
})

test('crear una segunda sala muestra datos limpios de la nueva', async ({ page }) => {
  await page.goto('#/')
  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const urlA = page.url()
  const salaA = urlA.match(/#\/sala\/([A-Za-z0-9]{6})/)![1]

  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()

  await page.getByRole('button', { name: /Crear sala/ }).click()
  await expect(page).toHaveURL(/#\/sala\/([A-Za-z0-9]{6})/)
  const salaB = page.url().match(/#\/sala\/([A-Za-z0-9]{6})/)![1]
  expect(salaB).not.toBe(salaA)

  // lobby limpio de la sala B
  await expect(page.getByRole('heading', { name: new RegExp(salaB) })).toBeVisible()
  await expect(page.getByText('1/20 jugadores')).toBeVisible()
})

test('completa las 5 rondas del hipster hasta la final', async ({ page }) => {
  await page.goto('#/sala/corta1?host=1&name=Ana&segundos=30')

  await expect(page.getByLabel('Segundos por ronda').first()).toHaveValue('30')
  await page.getByRole('button', { name: /Cargar lista/ }).click()
  await expect(page.getByText(/Lista ✓ 5 rondas/)).toBeVisible()
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText('⏱ 30s').first()).toBeVisible()
  for (let i = 0; i < 5; i++) {
    await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
    await page.getByRole('button', { name: /^A\. / }).click()
    await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
    if (i < 4) await page.getByRole('button', { name: 'Siguiente' }).click()
  }
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { name: /Clasificación final/ })).toBeVisible()
  await page.getByRole('button', { name: /Volver al lobby/ }).click()
  await expect(page.getByRole('button', { name: /Empezar hipster/ })).toBeVisible()
})
