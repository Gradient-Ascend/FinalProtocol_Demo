import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
// DIST_DIR and SHOTS_DIR point the check at a build, and its screenshots, somewhere else.
const DIST = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : join(ROOT, 'dist')
const SHOTS = process.env.SHOTS_DIR ? resolve(process.env.SHOTS_DIR) : join(ROOT, 'verification-shots')
mkdirSync(SHOTS, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  try {
    // The query is dropped first: '/?intro=0' is the index page too.
    const pathname = req.url.split('?')[0]
    const raw = pathname === '/' ? '/index.html' : pathname
    const file = resolve(DIST, '.' + decodeURIComponent(raw))
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, resolve))
// CHROMIUM_PATH wins when set; otherwise the installed Chrome (there is no bundled browser here).
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
  : { channel: 'chrome' })
// `tabs`: one panel at a time behind the OPERATOR / GEEKS tabs. `touch`: driven by touch events.
const cases = [
  { name: 'phone-landscape', width: 844, height: 390, tabs: true, touch: true },
  { name: 'phone-portrait', width: 390, height: 844, tabs: true },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]
const results = []

// The board is laid out inside the canvas, which shares the board area with the strip under it.
function warpPoint(metrics, pos) {
  const width = metrics.canvas.width
  const height = metrics.canvas.height
  const cell = Math.max(12, Math.floor(Math.min((width - 80) / 15, (height - 92) / 15)))
  const boardPx = cell * 15
  return {
    x: metrics.canvas.x + Math.round((width - boardPx) / 2 + 10) + (pos.x + 0.5) * cell,
    y: metrics.canvas.y + Math.round((height - boardPx) / 2 + 20) + (pos.y + 0.5) * cell,
  }
}

async function assertRouteLength(page, expected, label) {
  const actual = await page.evaluate(() => window.__battleProbe()?.actions.length)
  if (actual !== expected) throw new Error(`${label}: expected ${expected} route actions, got ${actual}`)
}

try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: item.width, height: item.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    const errors = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    // ?intro=0: straight to the title, without the attach screen and the opening sequence.
    await page.goto(`http://127.0.0.1:${server.address().port}/?intro=0`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__GAME_READY__ === true)
    await page.getByRole('button', { name: /^(START|BREACH SANDBOX)\b/ }).click()
    await page.waitForTimeout(250)
    const tutSkip = page.getByRole('dialog', { name: 'First battle tutorial' }).getByRole('button', { name: 'SKIP' })
    if (await tutSkip.isVisible().catch(() => false)) {
      await tutSkip.click()
      await page.waitForTimeout(150)
    }
    await page.evaluate(() => {
      window.__panCount = 0
      window.addEventListener('map-pan-changed', () => { window.__panCount++ })
    })
    const metrics = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector)
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
      }
      const font = selector => {
        const element = document.querySelector(selector)
        return element ? Number.parseFloat(getComputedStyle(element).fontSize) : null
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        verticalOverflow: document.documentElement.scrollHeight > innerHeight,
        board: box('.board-area'),
        canvas: box('#game-canvas'),
        player: box('.player-panel'),
        enemy: box('.enemy-panel'),
        actionIndicator: box('.action-indicator'),
        overload: box('.overload-button'),
        execute: box('.execute-button'),
        topIcon: box('.icon-button'),
        viewDot: box('.view-dot'),
        bodyFont: font('.preset-title strong'),
        detailFont: font('.method-detail p'),
        metaViewport: document.querySelector('meta[name="viewport"]')?.content,
      }
    })
    if (metrics.board.x < 0 || metrics.board.x + metrics.board.width > item.width) throw new Error(`${item.name}: board is horizontally clipped`)
    if (metrics.actionIndicator.height < 44 || metrics.overload.height < 44 || metrics.topIcon.width < 44 || metrics.viewDot.width < 28) {
      throw new Error(`${item.name}: touch target is too small ${JSON.stringify(metrics)}`)
    }
    const fullscreenButton = page.getByRole('button', { name: 'Enter fullscreen' })
    if (await fullscreenButton.count() !== 1 || !(await fullscreenButton.isVisible())) throw new Error(`${item.name}: fullscreen button is not visible`)
    if (await fullscreenButton.isDisabled()) throw new Error(`${item.name}: fullscreen should be available in the test browser`)
    await fullscreenButton.click()
    await page.waitForFunction(() => Boolean(document.fullscreenElement))
    await page.getByRole('button', { name: 'Exit fullscreen' }).click()
    await page.waitForFunction(() => !document.fullscreenElement)

    const centerX = metrics.canvas.x + metrics.canvas.width / 2
    const centerY = metrics.canvas.y + metrics.canvas.height / 2
    if (item.touch) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX - 45, y: centerY }, { x: centerX + 45, y: centerY }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centerX - 90, y: centerY }, { x: centerX + 90, y: centerY }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => Number(document.querySelector('.zoom-value')?.textContent?.replace('%', '')) > 100)
      await page.keyboard.press('Control+0')

      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX, y: centerY }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centerX + 65, y: centerY + 30 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => window.__panCount > 0)
      await page.waitForTimeout(60)
      await assertRouteLength(page, 0, 'One-finger drag must not click a Warp')
      await page.keyboard.press('Control+0')
      const tap = warpPoint(metrics, { x: 7, y: 6 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tap.x, y: tap.y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForFunction(() => window.__battleProbe()?.actions.length === 1)
      await page.keyboard.press('Backspace')

      const scroll = await page.locator('.player-panel').evaluate(element => {
        element.scrollTop = 80
        return { top: element.scrollTop, max: element.scrollHeight - element.clientHeight, overflow: getComputedStyle(element).overflowY }
      })
      if (scroll.max > 0 && scroll.top === 0) throw new Error('Operator panel does not scroll independently')
      if (scroll.overflow !== 'auto') throw new Error(`Operator panel is not scrollable: ${scroll.overflow}`)
    } else {
      await page.mouse.move(centerX, centerY)
      await page.mouse.wheel(0, -220)
      await page.waitForFunction(() => Number(document.querySelector('.zoom-value')?.textContent?.replace('%', '')) > 100)
      await page.keyboard.press('Control+0')
      await page.keyboard.press('Control+Minus')
      await page.waitForFunction(() => Number(document.querySelector('.zoom-value')?.textContent?.replace('%', '')) < 100)
      await page.keyboard.press('Control+0')

      await page.mouse.move(centerX, centerY)
      await page.mouse.down()
      await page.mouse.move(centerX + 70, centerY + 35, { steps: 6 })
      await page.mouse.up()
      await page.waitForFunction(() => window.__panCount > 0)
      await page.waitForTimeout(60)
      await assertRouteLength(page, 0, 'Mouse drag must not click a Warp')
      await page.keyboard.press('Control+0')
      const click = warpPoint(metrics, { x: 7, y: 6 })
      await page.mouse.click(click.x, click.y)
      await page.waitForFunction(() => window.__battleProbe()?.actions.length === 1)
      await page.keyboard.press('Backspace')
    }
    await page.locator('.preset.selected .action-indicator').nth(1).click()
    await page.waitForFunction(() => window.__battleProbe()?.attackPreview?.stepIndex === 1)
    await page.getByRole('button', { name: 'Close method preview' }).click()
    if (await page.locator('.method-detail.active').count()) throw new Error(`${item.name}: method preview did not dismiss`)
    if (item.tabs) {
      await page.getByRole('button', { name: 'GEEKS', exact: true }).click()
      if (!(await page.locator('.enemy-panel').isVisible())) throw new Error(`${item.name}: Geeks tab did not display enemy panel`)
      if (await page.locator('.player-panel').isVisible()) throw new Error(`${item.name}: Geeks tab left the operator panel showing`)
      // The panels a campaign adds live in this column: the route and its button stay reachable.
      const execute = await page.locator('.execute-button').boundingBox()
      if (!execute || execute.height < 44 || execute.x < 0 || execute.x + execute.width > item.width) {
        throw new Error(`${item.name}: execute button is clipped or too small ${JSON.stringify(execute)}`)
      }
      await page.getByRole('button', { name: 'OPERATOR', exact: true }).click()
      if (!(await page.locator('.player-panel').isVisible())) throw new Error(`${item.name}: Operator tab did not display player panel`)
    }
    if (metrics.horizontalOverflow) throw new Error(`${item.name}: the page is wider than the screen ${JSON.stringify(metrics.document)}`)
    await page.locator('.player-panel').evaluate(element => { element.scrollTop = 0 })
    await page.locator('.enemy-panel').evaluate(element => { element.scrollTop = 0 })
    const mapView = await page.evaluate(() => window.__mapProbe())
    if (mapView.zoom !== 1 || mapView.x < 0 || mapView.y < 0) throw new Error(`${item.name}: map was not reset after dragging ${JSON.stringify(mapView)}`)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(SHOTS, `${item.name}.png`), fullPage: true })
    await page.locator('.board-area').screenshot({ path: join(SHOTS, `${item.name}-board.png`) })
    results.push({ ...item, ...metrics, mapView, dragPanVerified: true, clickTapVerified: true, consoleErrors: errors })
    await context.close()
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
  server.close()
}
