import type { Page } from '@playwright/test'

/** Landing -> Introduction -> Simulation workspace, for specs that only need the workspace shell. */
export async function enterIrohaWorkspace(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Hyperledger Iroha/i }).click()
  await page.getByRole('button', { name: /Start demonstration/i }).click()
}

/** Enters the workspace and drives the Alice/Bob dialogue through to a running scenario. */
export async function enterIrohaWorkspaceAndSend(page: Page) {
  await enterIrohaWorkspace(page)
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: /Send 10 USD/i }).click()
}
