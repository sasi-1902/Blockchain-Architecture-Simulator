import { expect, test } from '@playwright/test'
import { enterIrohaWorkspaceAndSend } from './support'

test.describe('Stateful Validation educational check', () => {
  test.beforeEach(async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
  })

  test('is hidden before Stateful Validation and shown once it is reached, with the sufficient-funds check', async ({
    page,
  }) => {
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await expect(page.getByLabel('Stateful validation checks')).toHaveCount(0)

    for (let i = 0; i < 7; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    await expect(page.getByLabel('Current step')).toHaveText(/validated against the World State View/)

    const check = page.getByLabel('Stateful validation checks')
    await expect(check).toBeVisible()
    await expect(check.getByText('✓ Alice exists')).toBeVisible()
    await expect(check.getByText('✓ Bob exists')).toBeVisible()
    await expect(check.getByText('✓ USD asset exists')).toBeVisible()
    await expect(check.getByText(/Alice has sufficient USD to transfer 10/)).toBeVisible()
    await expect(check.getByText('Current Alice balance: 100')).toBeVisible()
    await expect(check.getByText('Transfer amount: 10 USD')).toBeVisible()
    await expect(check.getByText('Result: sufficient funds')).toBeVisible()
  })

  test('disappears once the scenario advances past Stateful Validation', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Simulation controls' })
    for (let i = 0; i < 8; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    await expect(page.getByLabel('Current step')).not.toHaveText(/validated against the World State View/)
    await expect(page.getByLabel('Stateful validation checks')).toHaveCount(0)
  })

  test('shows the sender\'s current balance from the prior transaction on a second run', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Simulation controls' })
    for (let i = 0; i < 11; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    await page.getByRole('button', { name: /Make another transaction/i }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('button', { name: /Send 10 USD/i }).click()

    for (let i = 0; i < 7; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    const check = page.getByLabel('Stateful validation checks')
    await expect(check.getByText('Current Alice balance: 90')).toBeVisible()
  })
})
