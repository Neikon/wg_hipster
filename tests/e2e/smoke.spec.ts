import { test, expect } from '@playwright/test'

test('landing renderiza y crear sala lleva al lobby', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('#/')
  await expect(page.getByRole('heading', { name: /wg_hipster/ })).toBeVisible()
  await page.getByRole('button', { name: /Crear sala/ }).click()

  await expect(page).toHaveURL(/#\/sala\/[A-Za-z0-9]{6}/)
  await expect(page.getByRole('heading', { name: /Sala/ })).toBeVisible()

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

  // el anfitrión empieza la partida
  await page.getByRole('button', { name: /Empezar trivia/ }).click()

  // juego: pregunta visible a pantalla completa, sin elementos de lobby
  await expect(page.getByText(/Pregunta 1\/10/)).toBeVisible()
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

test('configura y termina una trivia de dos preguntas', async ({ page }) => {
  await page.goto('#/sala/corta1?host=1&name=Ana')

  await page.getByLabel('Número de preguntas').fill('2')
  await page.getByLabel('Segundos por pregunta').fill('5')
  await page.getByRole('button', { name: /Empezar trivia \(2 preguntas\)/ }).click()

  await expect(page.getByText('Pregunta 1/2')).toBeVisible()
  await page.getByRole('button', { name: /B\. Madrid/ }).click()
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await expect(page.getByText('Pregunta 2/2')).toBeVisible()
  await page.getByRole('button', { name: /B\. 6/ }).click()
  await page.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page.getByRole('heading', { name: /Clasificación final/ })).toBeVisible()
})
