import { expect, test } from '@playwright/test'
import { enterIrohaWorkspace } from './support'

test.describe('Component detail drawer', () => {
  test.beforeEach(async ({ page }) => {
    await enterIrohaWorkspace(page)
  })

  test('clicking a component opens its detail drawer with overview, data flow, and concepts', async ({ page }) => {
    await page.getByRole('button', { name: /^Torii:/ }).click()

    const drawer = page.getByRole('dialog', { name: 'Torii details' })
    await expect(drawer).toBeVisible()

    await expect(drawer.getByRole('heading', { name: 'Torii', exact: true })).toBeVisible()
    await expect(drawer.getByText(/Accepts signed transactions and queries from clients/)).toBeVisible()
    await expect(drawer.getByText(/single, well-defined entry point/)).toBeVisible()

    await expect(drawer.getByText('signed transaction', { exact: true })).toBeVisible()
    await expect(drawer.getByText('transaction forwarded for stateless validation')).toBeVisible()
    await expect(drawer.getByText('Client', { exact: true })).toBeVisible()
    await expect(drawer.getByText('Stateless Validation', { exact: true })).toBeVisible()

    await expect(drawer.getByText('Related Concepts')).toBeVisible()
  })

  test('Escape closes the drawer', async ({ page }) => {
    await page.getByRole('button', { name: /^Torii:/ }).click()
    await expect(page.getByRole('dialog', { name: 'Torii details' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Torii details' })).toHaveCount(0)
  })

  test('the close button closes the drawer', async ({ page }) => {
    await page.getByRole('button', { name: /^Torii:/ }).click()
    const drawer = page.getByRole('dialog', { name: 'Torii details' })
    await expect(drawer).toBeVisible()

    await drawer.getByRole('button', { name: 'Close component details' }).click()
    await expect(drawer).toHaveCount(0)
  })

  test('activating a focused node with Enter opens the drawer', async ({ page }) => {
    await page.getByRole('button', { name: /^Torii:/ }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog', { name: 'Torii details' })).toBeVisible()
  })

  test('selecting a different component swaps the drawer contents', async ({ page }) => {
    await page.getByRole('button', { name: /^Torii:/ }).click()
    await expect(page.getByRole('dialog', { name: 'Torii details' })).toBeVisible()

    await page.getByRole('button', { name: /^Block Creator:/ }).click()
    await expect(page.getByRole('dialog', { name: 'Block Creator details' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Torii details' })).toHaveCount(0)
  })
})
