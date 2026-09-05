import { test, expect } from '@playwright/test'

test('hipster responde bien y suma 100', async ({ page }) => {
  await page.goto('#/sala/hipst1?host=1&name=Ana&juego=hipster')
  await page.getByRole('button', { name: /Empezar hipster/ }).click()
  await expect(page.getByText(/¿Qué canción es\?/)).toBeVisible()
  await expect(page.locator('audio')).toHaveAttribute('src', /^https:\/\//)
  await page.getByRole('button', { name: /^A\. / }).click()
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
  await expect(page.getByText('Ana: 100')).toBeVisible()
})
