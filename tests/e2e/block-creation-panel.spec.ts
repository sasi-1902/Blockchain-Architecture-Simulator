import { expect, test, type Page } from '@playwright/test'
import { enterIrohaWorkspaceAndSend } from './support'

async function runScenarioToCommit(page: Page) {
  const controls = page.getByRole('group', { name: 'Simulation controls' })
  for (let i = 0; i < 11; i += 1) {
    await controls.getByRole('button', { name: 'Next' }).click()
  }
}

async function makeAnotherTransaction(page: Page) {
  await page.getByRole('button', { name: /Make another transaction/i }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /Send 10 USD/i }).click()
}

test.describe('Block creation panel', () => {
  test.beforeEach(async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
  })

  test('starts with the Genesis block, no candidate/committed block, and the starting 100/20 balances', async ({
    page,
  }) => {
    const blockPanel = page.getByLabel('Block creation')
    await expect(blockPanel.getByText('Genesis')).toBeVisible()
    await expect(page.locator('[data-testid="candidate-block"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(0)

    const worldState = page.getByLabel('World state view')
    await expect(worldState.getByText('Alice', { exact: true })).toBeVisible()
    await expect(worldState.getByText('Bob', { exact: true })).toBeVisible()
    await expect(worldState.getByText('USD balance: 100')).toBeVisible()
    await expect(worldState.getByText('USD balance: 20')).toBeVisible()
  })

  test('shows a candidate block once Block Creator is reached', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Simulation controls' })
    for (let i = 0; i < 9; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    await expect(page.getByLabel('Current step')).toHaveText(/converted into a candidate block/)
    const candidateBlock = page.locator('[data-testid="candidate-block"]')
    await expect(candidateBlock).toBeVisible()
    await expect(candidateBlock).toContainText('alice')
    await expect(candidateBlock).toContainText('bob')
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(0)
  })

  test('marks the candidate block as agreed once YAC Consensus is reached', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Simulation controls' })
    for (let i = 0; i < 10; i += 1) {
      await controls.getByRole('button', { name: 'Next' }).click()
    }

    await expect(page.getByLabel('Current step')).toHaveText(/Peers conceptually agree/)
    await expect(page.locator('[data-testid="candidate-block"]')).toContainText(/consensus/i)
  })

  test('completing the first transaction creates exactly Block #1 and updates the cumulative World State View to 90/30', async ({
    page,
  }) => {
    await runScenarioToCommit(page)

    await expect(page.getByLabel('Current step')).toHaveText(/The block is committed and persisted/)

    const committedBlocks = page.locator('[data-testid="committed-block"]')
    await expect(committedBlocks).toHaveCount(1)
    await expect(committedBlocks.first()).toContainText('Block #1')
    await expect(committedBlocks.first()).toContainText('Previous: Genesis')
    await expect(page.locator('[data-testid="candidate-block"]')).toHaveCount(0)

    const worldState = page.getByLabel('World state view')
    await expect(worldState.getByText('USD balance: 90')).toBeVisible()
    await expect(worldState.getByText('USD balance: 30')).toBeVisible()
  })

  test('Make another transaction preserves Block #1, its 90/30 world state, and returns the interaction to its initial state', async ({
    page,
  }) => {
    await runScenarioToCommit(page)
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(1)

    await page.getByRole('button', { name: /Make another transaction/i }).click()

    // Block #1 and its resulting balances survive.
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(1)
    const worldState = page.getByLabel('World state view')
    await expect(worldState.getByText('USD balance: 90')).toBeVisible()
    await expect(worldState.getByText('USD balance: 30')).toBeVisible()

    // The active transaction and interaction panel return to their initial state.
    await expect(page.getByRole('group', { name: 'Simulation controls' })).toHaveCount(0)
    await expect(page.getByText(/I want to send 10 USD to Bob/)).toBeVisible()
    await expect(page.locator('[data-testid="transaction-marker"]')).toHaveCSS('opacity', '0')
  })

  test('completing a second transaction appends exactly Block #2 and updates World State to 80/40', async ({
    page,
  }) => {
    await runScenarioToCommit(page)
    await makeAnotherTransaction(page)
    await runScenarioToCommit(page)

    const blockPanel = page.getByLabel('Block creation')
    await expect(blockPanel.getByText('Genesis', { exact: true })).toBeVisible()

    const committedBlocks = page.locator('[data-testid="committed-block"]')
    await expect(committedBlocks).toHaveCount(2)
    await expect(committedBlocks.nth(0)).toContainText('Block #1')
    await expect(committedBlocks.nth(1)).toContainText('Block #2')
    await expect(committedBlocks.nth(1)).toContainText('Previous: Block #1')

    const worldState = page.getByLabel('World state view')
    await expect(worldState.getByText('USD balance: 80')).toBeVisible()
    await expect(worldState.getByText('USD balance: 40')).toBeVisible()
  })

  test('Reset during a later transaction does not delete already-committed blocks or balances', async ({ page }) => {
    await runScenarioToCommit(page)
    await makeAnotherTransaction(page)

    const controls = page.getByRole('group', { name: 'Simulation controls' })
    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Reset' }).click()

    await expect(page.getByLabel('Current step')).toHaveText('Press Next or Play to begin the scenario.')
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="committed-block"]').first()).toContainText('Block #1')

    const worldState = page.getByLabel('World state view')
    await expect(worldState.getByText('USD balance: 90')).toBeVisible()
    await expect(worldState.getByText('USD balance: 30')).toBeVisible()
  })

  test('scrubbing back and forth after commit does not create a duplicate block', async ({ page }) => {
    await runScenarioToCommit(page)
    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(1)

    const controls = page.getByRole('group', { name: 'Simulation controls' })
    await controls.getByRole('button', { name: 'Previous' }).click()
    await controls.getByRole('button', { name: 'Next' }).click()

    await expect(page.locator('[data-testid="committed-block"]')).toHaveCount(1)
  })
})
