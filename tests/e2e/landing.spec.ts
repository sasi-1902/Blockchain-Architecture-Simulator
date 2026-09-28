import { expect, test } from '@playwright/test'

test.describe('Landing page', () => {
  test('renders all four blockchain choice cards', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: /Hyperledger Iroha/i })).toBeVisible()
    await expect(page.getByText('Hyperledger Fabric')).toBeVisible()
    await expect(page.getByText('Ethereum')).toBeVisible()
    await expect(page.getByText('Bitcoin')).toBeVisible()
  })

  test('shows the "Blockchain demonstration" eyebrow and concise description', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Blockchain demonstration', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Explore what happens inside a blockchain system when a transaction is submitted', {
        exact: true,
      }),
    ).toBeVisible()
  })

  test('no longer shows the old debugger/block-explorer marketing copy', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText(/debugger for blockchain internals/i)).toHaveCount(0)
    await expect(page.getByText(/not a block explorer/i)).toHaveCount(0)
  })

  test('only Iroha is interactive; the other three show Coming soon', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: /Hyperledger Iroha/i })).toBeEnabled()

    for (const name of [/Hyperledger Fabric/i, /^Ethereum/i, /^Bitcoin/i]) {
      await expect(page.getByRole('button', { name })).toBeDisabled()
    }

    await expect(page.getByText('Coming soon')).toHaveCount(3)
  })

  test('disabled cards do not navigate or activate', async ({ page }) => {
    await page.goto('/')

    const fabricCard = page.getByRole('button', { name: /Hyperledger Fabric/i })
    await expect(fabricCard).toBeDisabled()

    // Disabled native buttons never dispatch click handlers; confirm the app stays put.
    await fabricCard.dispatchEvent('click')
    await expect(page.getByRole('heading', { name: /Blockchain Architecture and Simulator/i })).toBeVisible()
  })

  test('selecting Iroha transitions to the introduction screen', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: /Hyperledger Iroha/i }).click()

    await expect(page.getByRole('button', { name: /Start demonstration/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Blockchain Architecture and Simulator/i })).toHaveCount(0)
  })
})
