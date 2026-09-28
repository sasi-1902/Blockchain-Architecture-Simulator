import { expect, test } from '@playwright/test'

test.describe('Iroha introduction screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Hyperledger Iroha/i }).click()
  })

  test('explains the demonstration and offers Start demonstration and Back', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /transaction moving through Iroha v1/i })).toBeVisible()
    await expect(page.getByText(/Alice sends 10 USD to Bob/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Start demonstration/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible()
  })

  test('Back returns to architecture selection', async ({ page }) => {
    await page.getByRole('button', { name: /Back/i }).click()

    await expect(page.getByRole('heading', { name: /Blockchain Architecture and Simulator/i })).toBeVisible()
  })

  test('Start demonstration enters the simulation workspace', async ({ page }) => {
    await page.getByRole('button', { name: /Start demonstration/i }).click()

    await expect(page.getByRole('heading', { name: /Hyperledger Iroha v1/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Start demonstration/i })).toHaveCount(0)
  })
})
