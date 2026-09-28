import { expect, test } from '@playwright/test'
import { enterIrohaWorkspace } from './support'

const PIPELINE_ORDER = [
  'Client',
  'Torii',
  'Stateless Validation',
  'MST Processor',
  'Peer Communication Service',
  'Ordering Service',
  'Proposal',
  'Stateful Validation',
  'Verified Proposal',
  'Block Creator',
  'YAC Consensus',
  'Commit',
  'Blockstore / World State View',
]

/** Reading order of each row of the ENTRY+PRE-CHECK / ORDER+VERIFY / CONSENSUS+COMMIT snake layout (DESIGN.md §8 order preserved; rows 2 visually reads right-to-left in the underlying flow). */
const ROWS = [
  ['Client', 'Torii', 'Stateless Validation', 'MST Processor', 'Peer Communication Service'],
  ['Verified Proposal', 'Stateful Validation', 'Proposal', 'Ordering Service'],
  ['Block Creator', 'YAC Consensus', 'Commit', 'Blockstore / World State View'],
]

test.describe('Iroha v1 architecture diagram', () => {
  test.beforeEach(async ({ page }) => {
    await enterIrohaWorkspace(page)
  })

  test('renders every pipeline component', async ({ page }) => {
    for (const name of PIPELINE_ORDER) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}:`) })).toBeVisible()
    }
  })

  test('renders the three-row snake layout, each row left-to-right and rows top-to-bottom', async ({ page }) => {
    const rowBoxes: { y: number; x: number }[][] = []

    for (const row of ROWS) {
      const boxes: { y: number; x: number }[] = []
      for (const name of row) {
        const node = page.getByRole('button', { name: new RegExp(`^${name}:`) })
        const box = await node.boundingBox()
        expect(box).not.toBeNull()
        boxes.push({ x: box!.x, y: box!.y })
      }
      rowBoxes.push(boxes)
    }

    for (const boxes of rowBoxes) {
      for (let i = 1; i < boxes.length; i += 1) {
        expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x)
      }
      const rowY = boxes[0].y
      for (const box of boxes) {
        expect(Math.abs(box.y - rowY)).toBeLessThan(5)
      }
    }

    for (let i = 1; i < rowBoxes.length; i += 1) {
      expect(rowBoxes[i][0].y).toBeGreaterThan(rowBoxes[i - 1][0].y)
    }
  })

  test('presents the complete pipeline within the diagram viewport on first render', async ({ page }) => {
    const diagram = page.getByRole('group', { name: 'Architecture pipeline diagram' })
    const diagramBox = await diagram.boundingBox()
    expect(diagramBox).not.toBeNull()

    for (const name of PIPELINE_ORDER) {
      const node = page.getByRole('button', { name: new RegExp(`^${name}:`) })
      const box = await node.boundingBox()
      expect(box).not.toBeNull()

      // Every node must be fully contained within the diagram's visible bounds
      // on initial render (via `fitView`), not just present in the DOM off-canvas.
      expect(box!.y).toBeGreaterThanOrEqual(diagramBox!.y)
      expect(box!.y + box!.height).toBeLessThanOrEqual(diagramBox!.y + diagramBox!.height)
      expect(box!.x).toBeGreaterThanOrEqual(diagramBox!.x)
      expect(box!.x + box!.width).toBeLessThanOrEqual(diagramBox!.x + diagramBox!.width)
    }
  })

  test('supports normal wheel-zoom interaction on the architecture canvas', async ({ page }) => {
    const diagram = page.getByRole('group', { name: 'Architecture pipeline diagram' })
    const viewport = page.locator('.react-flow__viewport')

    const transformBefore = await viewport.evaluate((el) => el.style.transform)

    const box = await diagram.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(150)

    const transformAfter = await viewport.evaluate((el) => el.style.transform)
    expect(transformAfter).not.toBe(transformBefore)
  })

  test('hovering a component highlights its communicatesWith edges and dims unrelated elements', async ({
    page,
  }) => {
    const toriiNode = page.getByRole('button', { name: /^Torii:/ })
    const clientToToriiEdge = page.locator('[data-testid="rf__edge-client-to-torii"] path.react-flow__edge-path')
    const toriiToStatelessEdge = page.locator(
      '[data-testid="rf__edge-torii-to-stateless-validation"] path.react-flow__edge-path',
    )
    const unrelatedEdge = page.locator(
      '[data-testid="rf__edge-stateless-validation-to-mst-processor"] path.react-flow__edge-path',
    )
    const unrelatedNode = page.getByRole('button', { name: /^MST Processor:/ })

    await expect(toriiNode).toHaveAttribute('data-emphasis', 'normal')

    await toriiNode.hover()

    await expect(toriiNode).toHaveAttribute('data-emphasis', 'normal')
    await expect(unrelatedNode).toHaveAttribute('data-emphasis', 'dimmed')
    await expect(clientToToriiEdge).toHaveCSS('opacity', '1')
    await expect(toriiToStatelessEdge).toHaveCSS('opacity', '1')
    await expect(unrelatedEdge).toHaveCSS('opacity', '0.2')

    await page.mouse.move(0, 0)

    await expect(unrelatedNode).toHaveAttribute('data-emphasis', 'normal')
    await expect(unrelatedEdge).toHaveCSS('opacity', '1')
  })

  test('renders a category legend covering every category used in the pipeline', async ({ page }) => {
    const legend = page.getByRole('list', { name: 'Category legend' })
    await expect(legend).toBeVisible()

    for (const label of [
      'Client',
      'Gateway',
      'Validation',
      'Networking',
      'Ordering',
      'Consensus',
      'Storage',
      'Other',
    ]) {
      await expect(legend.getByText(label, { exact: true })).toBeVisible()
    }
  })
})
