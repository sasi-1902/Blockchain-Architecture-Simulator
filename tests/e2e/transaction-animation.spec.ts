import { expect, test, type Locator, type Page } from '@playwright/test'
import { enterIrohaWorkspaceAndSend } from './support'

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

async function expectMarkerAtNode(marker: Locator, node: Locator) {
  await expect
    .poll(
      async () => {
        const markerCenter = await centerOf(marker)
        const nodeCenter = await centerOf(node)
        return Math.hypot(markerCenter.x - nodeCenter.x, markerCenter.y - nodeCenter.y)
      },
      { timeout: 3000 },
    )
    .toBeLessThan(20)
}

async function clickNext(panel: Locator, times = 1) {
  for (let i = 0; i < times; i += 1) {
    await panel.getByRole('button', { name: 'Next' }).click()
  }
}

test.describe('Transaction marker animation', () => {
  let page: Page
  let panel: Locator
  let marker: Locator

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage
    await enterIrohaWorkspaceAndSend(page)
    panel = page.getByRole('group', { name: 'Simulation controls' })
    marker = page.locator('[data-testid="transaction-marker"]')
  })

  test('is hidden before the scenario has started', async () => {
    await expect(marker).toHaveCSS('opacity', '0')
  })

  test('appears at Torii once the first step is reached', async () => {
    await clickNext(panel)

    await expect(marker).toHaveCSS('opacity', '1')
    await expectMarkerAtNode(marker, page.getByRole('button', { name: /^Torii:/ }))
  })

  test('follows the pipeline forward as Next advances the scenario', async () => {
    await clickNext(panel, 11)

    await expectMarkerAtNode(marker, page.getByRole('button', { name: /^Commit:/ }))
  })

  test('moves backward correctly when Previous is pressed', async () => {
    await clickNext(panel, 11)
    await expectMarkerAtNode(marker, page.getByRole('button', { name: /^Commit:/ }))

    await panel.getByRole('button', { name: 'Previous' }).click()

    await expectMarkerAtNode(marker, page.getByRole('button', { name: /^YAC Consensus:/ }))
  })

  test('disappears when Reset returns the scenario to its initial state', async () => {
    await clickNext(panel, 3)
    await expect(marker).toHaveCSS('opacity', '1')

    await panel.getByRole('button', { name: 'Reset' }).click()

    await expect(marker).toHaveCSS('opacity', '0')
  })
})
