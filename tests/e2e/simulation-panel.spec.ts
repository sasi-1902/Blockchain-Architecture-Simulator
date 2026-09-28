import { expect, test } from '@playwright/test'
import { enterIrohaWorkspace, enterIrohaWorkspaceAndSend } from './support'

test.describe('Transaction simulation', () => {
  test('Alice starts the interaction and sending enters the existing scenario flow', async ({ page }) => {
    await enterIrohaWorkspace(page)

    await expect(page.getByText(/I want to send 10 USD to Bob/)).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()

    await expect(page.getByText(/Ready to submit Alice.s transaction/)).toBeVisible()
    await page.getByRole('button', { name: /Send 10 USD/i }).click()

    await expect(page.getByRole('group', { name: 'Simulation controls' })).toBeVisible()
    await expect(page.getByLabel('Current step')).toHaveText('Press Next or Play to begin the scenario.')
  })

  test('Next advances the simulation exactly one step and updates narration', async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await controls.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Current step')).toHaveText(/Alice's client submits the signed transfer to Torii/)

    await controls.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Current step')).toHaveText(/The transaction structure and signature format/)

    await expect(page.getByRole('list', { name: 'Narration history' }).getByRole('listitem')).toHaveCount(2)
  })

  test('Previous moves backward correctly', async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Previous' }).click()

    await expect(page.getByLabel('Current step')).toHaveText(/Alice's client submits the signed transfer to Torii/)
  })

  test('Reset returns the scenario to its initial state', async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Next' }).click()
    await controls.getByRole('button', { name: 'Reset' }).click()

    await expect(page.getByLabel('Current step')).toHaveText('Press Next or Play to begin the scenario.')
  })

  test('Play autoplays and Pause stops without corrupting the current step', async ({ page }) => {
    await enterIrohaWorkspaceAndSend(page)
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await controls.getByRole('button', { name: 'Play' }).click()
    await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible()

    await expect(page.getByLabel('Current step')).not.toHaveText('Press Next or Play to begin the scenario.', {
      timeout: 5000,
    })

    await controls.getByRole('button', { name: 'Pause' }).click()
    const stepAtPause = await page.getByLabel('Current step').textContent()

    await page.waitForTimeout(2000)
    await expect(page.getByLabel('Current step')).toHaveText(stepAtPause ?? '')
  })

  test('reaches commit and displays the Alice/Bob balance change', async ({ page }) => {
    test.setTimeout(60000)
    await enterIrohaWorkspaceAndSend(page)
    const controls = page.getByRole('group', { name: 'Simulation controls' })

    await controls.getByRole('button', { name: 'Play' }).click()
    await expect(page.getByLabel('Current step')).toHaveText(/The block is committed and persisted/, {
      timeout: 30000,
    })

    const stateChanges = page.getByLabel('Transaction state')
    await expect(stateChanges.getByText(/worldStateView\.alice\.balanceChange: -10/)).toBeVisible()
    await expect(stateChanges.getByText(/worldStateView\.bob\.balanceChange: \+10/)).toBeVisible()

    await expect(page.getByText(/Bob.*Received 10 USD/)).toBeVisible()
  })
})
