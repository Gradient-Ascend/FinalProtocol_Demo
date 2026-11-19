import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
// DIST_DIR and SHOTS_DIR point the check at a build, and its screenshots, somewhere else.
const DIST = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : join(ROOT, 'dist')
const SHOTS = process.env.SHOTS_DIR ? resolve(process.env.SHOTS_DIR) : join(ROOT, 'verification-shots')
mkdirSync(SHOTS, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  try {
    // The query is dropped first: '/?intro=0' is the index page too.
    const pathname = req.url.split('?')[0]
    const raw = pathname === '/' ? '/index.html' : pathname
    const file = resolve(DIST, '.' + decodeURIComponent(raw))
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return }
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, resolve))
const port = server.address().port
// CHROMIUM_PATH wins when set; otherwise the installed Chrome (there is no bundled browser here).
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-gpu-sandbox'] }
  : { channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('pageerror', error => errors.push(String(error)))

const snapshot = () => page.evaluate(() => window.__battleProbe())
const waitPhase = phases => page.waitForFunction(
  expected => expected.includes(window.__battleProbe()?.phase),
  phases,
  { timeout: 15000 },
)
const keyFor = (a, b) => b.x > a.x ? 'KeyD' : b.x < a.x ? 'KeyA' : b.y > a.y ? 'KeyS' : 'KeyW'

function bestRoute(state, focusOverload = false, targetEnemyForOverload = false) {
  const enemies = state.enemies.filter(enemy => enemy.robustness > 0)
  const blocked = new Set(enemies.map(enemy => `${enemy.pos.x},${enemy.pos.y}`))
  for (const curtain of state.curtains.filter(item => item.locked)) {
    for (let i = 0; i < 15; i++) {
      const pos = curtain.axis === 'column' ? { x: curtain.index, y: i } : { x: i, y: curtain.index }
      blocked.add(`${pos.x},${pos.y}`)
    }
  }
  function scoreOverloadPos(pos) {
    return Math.max(...enemies.map(enemy => {
      const dist = Math.abs(enemy.pos.x - pos.x) + Math.abs(enemy.pos.y - pos.y)
      const aligned = (enemy.pos.x === pos.x || enemy.pos.y === pos.y) && dist <= 3
      return (aligned ? 40 : 0) - dist * 35
    }))
  }
  let best = { path: [], score: targetEnemyForOverload ? scoreOverloadPos(state.player.pos) : -1e9 }
  const start = state.player.pos
  function walk(pos, path, visited) {
    if (path.length) {
      let score
      if (targetEnemyForOverload) {
        score = scoreOverloadPos(pos)
      } else {
        const counts = { bash: 0, core: 0, privilege: 0, overload: 0, blank: 0 }
        for (const step of path) counts[state.flags[step.y][step.x]]++
        const distance = Math.min(...enemies.map(enemy => Math.abs(enemy.pos.x - pos.x) + Math.abs(enemy.pos.y - pos.y)))
        const releases = Math.min(counts.bash, 8 - path.length, 4)
        score = releases * 15 + counts.core * 5 + counts.privilege * 3 + counts.overload * (focusOverload ? 80 : 7) - distance * 1.4 + path.length * .15
      }
      if (score > best.score) best = { path, score }
    }
    if (path.length >= 6) return
    for (const next of [{ x: pos.x + 1, y: pos.y }, { x: pos.x - 1, y: pos.y }, { x: pos.x, y: pos.y + 1 }, { x: pos.x, y: pos.y - 1 }]) {
      const key = `${next.x},${next.y}`
      if (next.x < 0 || next.y < 0 || next.x >= 15 || next.y >= 15 || state.walls[next.y][next.x] || blocked.has(key) || visited.has(key)) continue
      visited.add(key)
      walk(next, [...path, next], visited)
      visited.delete(key)
    }
  }
  walk(start, [], new Set([`${start.x},${start.y}`]))
  return best.path
}

async function playRoute(state, focusOverload = false, triggerOverload = false, overloadShotPath = null) {
  const targetEnemyForOverload = Boolean(overloadShotPath)
  const route = bestRoute(state, focusOverload && !targetEnemyForOverload, targetEnemyForOverload)
  let cursor = state.player.pos
  for (const next of route) {
    await page.keyboard.press(keyFor(cursor, next))
    cursor = next
  }
  if (triggerOverload) {
    await page.keyboard.press('KeyO')
    if (!(await snapshot()).overloadArmed) throw new Error('First O did not arm Overload preview')
    const overloadPreview = await page.locator('.overload-preview-value').textContent()
    if (overloadShotPath) {
      if (!overloadPreview || !/−\d+/.test(overloadPreview)) {
        throw new Error(`Overload shot expected a concrete target damage preview, got: ${overloadPreview}`)
      }
    } else if (!overloadPreview || (!/−\d+/.test(overloadPreview) && overloadPreview.trim() !== 'NO TARGET')) {
      throw new Error(`Overload damage preview is missing: ${overloadPreview}`)
    }
    await page.screenshot({ path: join(SHOTS, '08-overload.png') })
    await page.keyboard.press('KeyO')
    if ((await snapshot()).overloadArmed) throw new Error('Second O did not release Overload')
    if (overloadShotPath) {
      await page.waitForFunction(
        () => (window.__vfxProbe?.()?.activeRibbons ?? 0) > 0,
        null,
        { timeout: 3000 },
      )
      await page.waitForTimeout(360)
      await page.screenshot({ path: overloadShotPath })
    }
  }
  await page.getByRole('button', { name: /EXECUTE ROUTE/ }).click()
  await waitPhase(['planning', 'victory', 'gameover'])
}

try {
  // ?intro=0: straight to the title, without the attach screen and the opening sequence.
  await page.goto(`http://127.0.0.1:${port}/?intro=0`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__GAME_READY__ === true)

  // Verify Title-screen Progress Saver + multi-user host isolation
  await page.getByRole('button', { name: /SAVE \/ USER/ }).click()
  await page.getByRole('textbox', { name: 'User ID' }).fill('qa-guest')
  await page.getByRole('button', { name: /SWITCH \/ CREATE/ }).click()
  await page.waitForFunction(() => window.location.search.includes('user=qa-guest'))
  await page.getByRole('button', { name: /SAVE NOW/ }).click()
  await page.screenshot({ path: join(SHOTS, '01b-progress-saver.png') })
  await page.getByRole('button', { name: /REMOVE USER/ }).click()
  await page.getByRole('button', { name: /CONFIRM REMOVE\?/ }).click()
  await page.waitForFunction(() => !window.location.search.includes('user='))
  await page.getByRole('dialog', { name: 'Progress saver' }).getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: /BREACH SANDBOX/ }).click()
  await waitPhase(['planning'])
  const vfxIdle = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxIdle || vfxIdle.setting !== 'high' || vfxIdle.tier !== 'high' || vfxIdle.backend !== 'webgl2' || vfxIdle.renderPassesLastFrame !== 0) {
    throw new Error(`Expected default HIGH WebGL2 idle VFX state in planning: ${JSON.stringify(vfxIdle)}`)
  }
  if (await page.locator('.enemy-card').count() !== 3) throw new Error('All three hostiles should stay pinned in the right panel')
  if (await page.locator('.enemy-card.affected').count() !== 0) throw new Error('No hostile should be marked affected before planning')
  if (await page.locator('.enemy-next-attack').count() !== 3) throw new Error('Compact hostile cards should summarize armed next attacks')
  if (await page.locator('.enemy-dossier-popup').count() !== 0) throw new Error('Dossier popup should remain closed until a panel card is inspected')

  const mapMetrics = await page.evaluate(() => {
    const rect = document.getElementById('game-canvas').getBoundingClientRect()
    const map = window.__mapProbe()
    return { x: rect.left, y: rect.top, map }
  })
  const b01Point = {
    x: mapMetrics.x + mapMetrics.map.x + (7 + 0.5) * mapMetrics.map.cell,
    y: mapMetrics.y + mapMetrics.map.y + (4 + 0.5) * mapMetrics.map.cell,
  }
  await page.mouse.move(b01Point.x, b01Point.y)
  await page.waitForSelector('.enemy-card[data-enemy="B01"].map-hover')
  if (await page.locator('.enemy-dossier-popup').count() !== 0) throw new Error('Map hover must not open dossier popup over the board')
  const focusText = await page.locator('.incoming-focus-tag').textContent()
  if (!focusText?.includes('B01')) throw new Error(`Missing B01 focus tag on Player Sanity bar: ${focusText}`)
  if (await page.locator('.player-sanity .incoming-segment.enemy-linked').count() < 1) {
    throw new Error('Map hover on B01 did not link its incoming damage segments on Player Sanity bar')
  }
  await page.screenshot({ path: join(SHOTS, '05a-map-hover-multi-attack.png') })
  await page.mouse.click(b01Point.x, b01Point.y)
  await page.waitForFunction(() => window.__battleProbe()?.enemyAttackPreview?.enemyId === 'B01' && window.__battleProbe()?.enemyAttackPreview?.stepIndex === 0)
  await page.mouse.move(mapMetrics.x + 8, mapMetrics.y + 8)
  await page.waitForFunction(() => window.__battleProbe()?.enemyAttackPreview === null)

  await page.locator('.enemy-card[data-enemy="B01"]').hover()
  await page.waitForSelector('.enemy-dossier-popup[data-enemy-dossier="B01"]')
  const dossierMetrics = await page.evaluate(() => {
    const popup = document.querySelector('.enemy-dossier-popup')?.getBoundingClientRect()
    const panel = document.querySelector('.enemy-panel')?.getBoundingClientRect()
    const text = document.querySelector('.enemy-dossier-popup')?.textContent ?? ''
    return { popup, panel, text, vw: window.innerWidth, vh: window.innerHeight }
  })
  if (!dossierMetrics.popup || dossierMetrics.popup.left < 0 || dossierMetrics.popup.right > dossierMetrics.vw || dossierMetrics.popup.bottom > dossierMetrics.vh) {
    throw new Error(`Enemy dossier popup clipped out of viewport: ${JSON.stringify(dossierMetrics.popup)}`)
  }
  if (dossierMetrics.panel && dossierMetrics.popup.right > dossierMetrics.panel.left + 1) {
    throw new Error(`Enemy dossier popup overlapped right panel: ${JSON.stringify(dossierMetrics)}`)
  }
  for (const required of ['REHEARSAL', 'CLOSE', 'REPAIR', 'CLOSES ON YOU', '0x74']) {
    if (!dossierMetrics.text.includes(required)) throw new Error(`Enemy dossier popup missing "${required}"`)
  }
  await page.screenshot({ path: join(SHOTS, '05b-enemy-dossier-popup.png') })
  await page.mouse.move(0, 0)
  await page.waitForFunction(() => !document.querySelector('.enemy-dossier-popup'))
  await page.getByRole('button', { name: 'Show CoT' }).click()
  if (!(await page.locator('.preset-title strong').textContent())?.includes('CoT')) throw new Error('Display dot did not show CoT')
  if ((await snapshot()).player.activeBash !== 0) throw new Error('Display dot changed the mechanical Bash preset')
  await page.locator('.bash-viewer').dispatchEvent('wheel', { deltaY: 100 })
  if (!(await page.locator('.preset-title strong').textContent())?.includes('VECTOR')) throw new Error('Wheel did not cycle the displayed Bash preset')
  if ((await snapshot()).player.activeBash !== 0) throw new Error('Wheel changed the mechanical Bash preset')

  await page.getByRole('button', { name: 'Open manual' }).click()
  await page.getByRole('dialog', { name: 'Battle manual' }).waitFor()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('button', { name: 'Toggle reduced motion' }).click()
  await page.getByRole('button', { name: 'Toggle audio' }).click()
  await page.getByRole('button', { name: 'Toggle audio' }).click()
  const highQualityBtn = page.getByRole('button', { name: 'Visual quality high' })
  if ((await highQualityBtn.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('VISUAL QUALITY should default to HIGH in Settings')
  }
  await page.getByRole('button', { name: 'Visual quality low' }).click()
  const vfxLow = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxLow || vfxLow.tier !== 'low' || vfxLow.backend !== '2d' || vfxLow.vramBytesApprox !== 0) {
    throw new Error(`Visual quality LOW did not release FBO memory cleanly: ${JSON.stringify(vfxLow)}`)
  }
  await page.getByRole('button', { name: 'Visual quality medium' }).click()
  const vfxMed = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxMed || vfxMed.tier !== 'medium' || vfxMed.backend !== 'webgl2') {
    throw new Error(`Visual quality MEDIUM did not switch live to WebGL2 medium: ${JSON.stringify(vfxMed)}`)
  }
  await highQualityBtn.click()
  const vfxHigh = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxHigh || vfxHigh.tier !== 'high' || vfxHigh.backend !== 'webgl2') {
    throw new Error(`Visual quality HIGH did not restore cleanly: ${JSON.stringify(vfxHigh)}`)
  }
  await page.screenshot({ path: join(SHOTS, '04-settings.png') })
  await page.getByRole('button', { name: 'Close' }).click()

  if (await page.locator('.player-sanity .incoming-segment').count() < 1) throw new Error('Missing incoming Sanity damage segments')
  const playerBar = await page.locator('.player-sanity').evaluate(element => {
    const current = element.querySelector('.health-current')
    const left = element.querySelector('.incoming-segment.left-edge')
    const right = element.querySelector('.incoming-segment.right-edge')
    return {
      remainingWidth: Number.parseFloat(current.style.width),
      expectedWidth: Number.parseFloat(left.style.left),
      opacity: Number.parseFloat(getComputedStyle(current).opacity),
      remainingRadius: getComputedStyle(current).borderTopRightRadius,
      leftRadius: getComputedStyle(left).borderTopLeftRadius,
      rightRadius: getComputedStyle(right).borderTopRightRadius,
    }
  })
  if (Math.abs(playerBar.remainingWidth - playerBar.expectedWidth) > 0.01) throw new Error(`Player HP is not connected to the incoming damage segments: ${JSON.stringify(playerBar)}`)
  if (playerBar.opacity !== 1 || playerBar.remainingRadius !== '0px' || playerBar.leftRadius !== '0px' || playerBar.rightRadius !== '4px') throw new Error(`Player HP preview geometry is incorrect: ${JSON.stringify(playerBar)}`)
  await page.locator('.player-sanity .incoming-segment').first().hover()
  if (!(await snapshot()).enemyAttackPreview) throw new Error('Incoming segment did not expose enemy attack range')
  await page.mouse.move(0, 0)
  await page.evaluate(() => {
    window.__attackEffects = []
    window.addEventListener('battle-attack-effect', event => window.__attackEffects.push(event.detail))
  })

  await page.keyboard.press('KeyW')
  await page.keyboard.press('KeyW')
  if (await page.locator('.enemy-card.affected').count() !== 1) throw new Error('Expected exactly one affected Geek')
  const previewColor = await page.locator('.enemy-card.affected .to-be').evaluate(element => getComputedStyle(element).color)
  if (previewColor !== 'rgb(245, 245, 245)') throw new Error(`Projected HP is not white: ${previewColor}`)
  // 61, not 62: BASE deals 1 and pushes the Warden a cell away, so MANHATTAN measures 2
  // (battle.test.ts, 'fires one Bash preset step per Bash Flag and advances the turn').
  const projected = await page.locator('.to-be').textContent()
  if (!projected?.includes('61')) throw new Error(`Missing projected Desire value: ${projected}`)
  if (await page.locator('.action-slot').count() !== 8) throw new Error('Expected eight smaller AP slots')
  if (await page.locator('.action-indicator.lit').count() !== 2) throw new Error('Expected Roman steps I and II to light')
  const coreLayout = await page.locator('.buff-list').evaluate(element => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    overflow: getComputedStyle(element).overflowY,
  }))
  if (coreLayout.columns !== 3 || coreLayout.overflow !== 'visible') throw new Error(`Core counters are not one three-column row: ${JSON.stringify(coreLayout)}`)
  if (await page.locator('.buff-row').count() !== 3) throw new Error('Expected all three Core sub-blocks')
  const playerFit = await page.locator('.player-panel').evaluate(element => ({
    client: element.clientHeight,
    content: element.scrollHeight,
    overflow: getComputedStyle(element).overflowY,
    overloadBeforeDetails: document.querySelector('.overload-button')?.nextElementSibling?.classList.contains('method-detail'),
  }))
  if (playerFit.content > playerFit.client + 1 || playerFit.overflow !== 'hidden') throw new Error(`Player panel does not fit without outer scrolling: ${JSON.stringify(playerFit)}`)
  if (!playerFit.overloadBeforeDetails) throw new Error('Overload is not positioned before method details')
  await page.locator('.preset.selected .action-indicator').nth(1).hover()
  if (!(await page.locator('.method-detail strong').textContent())?.includes('MANHATTAN')) throw new Error('Roman indicator did not show MANHATTAN mechanics')
  if ((await snapshot()).attackPreview?.stepIndex !== 1) throw new Error('Roman indicator did not activate map range preview')
  if (await page.locator('.enemy-card .health-segment.previewing').count() !== 1) throw new Error('Expected only the hovered action segment to be highlighted in the HP bar')
  const rangeOrigin = await snapshot()
  if (rangeOrigin.actions.length !== 2 || rangeOrigin.player.pos.y !== 7) throw new Error('Range preview check expects an unexecuted two-step route')
  const segmentThickness = await page.locator('.enemy-card .health-segment').first().evaluate(element => ({
    segment: element.getBoundingClientRect().height,
    bar: element.parentElement.getBoundingClientRect().height,
  }))
  if (Math.abs(segmentThickness.segment - segmentThickness.bar) > 0.1) throw new Error(`Preview segment thickness differs from HP bar: ${JSON.stringify(segmentThickness)}`)
  const rightRadius = await page.locator('.enemy-card .health-segment.right-edge').first().evaluate(element => getComputedStyle(element).borderTopRightRadius)
  if (rightRadius !== '4px') throw new Error(`Outer-right preview edge is not rounded: ${rightRadius}`)
  const remainingRadius = await page.locator('.enemy-card .health-current').first().evaluate(element => getComputedStyle(element).borderTopRightRadius)
  if (remainingRadius !== '0px') throw new Error(`Remaining HP edge is not vertical with previews present: ${remainingRadius}`)
  const leftRadius = await page.locator('.enemy-card .health-segment.left-edge').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius)
  if (leftRadius !== '0px') throw new Error(`Inner-left preview edge is not vertical: ${leftRadius}`)
  const remainingWidth = await page.locator('.enemy-card .health-current').first().evaluate(element => Number.parseFloat(element.style.width))
  const expectedWidth = await page.locator('.enemy-card .health-segment.left-edge').first().evaluate(element => Number.parseFloat(element.style.left))
  if (Math.abs(remainingWidth - expectedWidth) > 0.01) throw new Error(`Remaining HP is not connected to the damage segments: ${remainingWidth} vs ${expectedWidth}`)
  const originalOpacity = await page.locator('.enemy-card .health-current').first().evaluate(element => Number.parseFloat(getComputedStyle(element).opacity))
  if (originalOpacity !== 1) throw new Error(`Remaining HP must stay solid outside the replacement segments: ${originalOpacity}`)
  const segmentColor = await page.locator('.enemy-card .health-segment.segment-1').first().evaluate(element => getComputedStyle(element).backgroundColor)
  if (!['rgb(242, 209, 107)', 'rgba(242, 209, 107, 0.78)'].includes(segmentColor)) throw new Error(`Outgoing preview is not GDD yellow: ${segmentColor}`)
  await page.locator('.enemy-card .health-segment.segment-1').first().hover()
  if (!(await page.locator('.method-detail strong').textContent())?.includes('MANHATTAN')) throw new Error('HP segment did not restore MANHATTAN preview')
  await page.screenshot({ path: join(SHOTS, '05-battle-compact.png') })
  await page.mouse.move(0, 0)
  await page.evaluate(() => { window.__battleProbe().player.overload = 5 })
  await page.keyboard.press('KeyO')
  const numericOverloadPreview = await page.locator('.overload-preview-value').textContent()
  if (!numericOverloadPreview || !/^−[1-9]\d*$/.test(numericOverloadPreview.trim())) {
    throw new Error(`Expected a numeric Overload damage preview, got ${numericOverloadPreview}`)
  }
  if (await page.locator('.action-indicator.overload-lit').count() !== 4) throw new Error('Overload did not light all four indicators yellow')
  await page.screenshot({ path: join(SHOTS, '08a-overload-damage.png') })
  await page.keyboard.press('Escape')
  if (await page.locator('.action-indicator.overload-lit').count() !== 0) throw new Error('Overload indicators did not return to normal mechanics')
  await page.evaluate(() => { window.__battleProbe().reducedMotion = false })
  await page.getByRole('button', { name: /EXECUTE ROUTE/ }).click()
  await page.waitForFunction(() => window.__battleProbe()?.phase === 'resolving' && window.__battleProbe()?.resolvedMoves > 0)
  if ((await snapshot()).playerTrail.length < 2) throw new Error('Gray trail did not appear during the current route')
  if (await page.locator('.player-sanity .incoming-segment').count() < 1) throw new Error('Incoming segments did not remain live during route resolution')
  await page.waitForFunction(() => window.__attackEffects.length > 0)
  await page.waitForFunction(
    () => (window.__vfxProbe?.()?.activeParticles ?? 0) > 0 || (window.__vfxProbe?.()?.activeRibbons ?? 0) > 0,
    null,
    { timeout: 3000 },
  ).catch(() => {})
  await page.waitForTimeout(50)
  await page.screenshot({ path: join(SHOTS, '13a-vfx-25d-strike.png') })
  await page.waitForFunction(() => window.__battleProbe()?.playerAttackResolved === true)
  await page.waitForFunction(() => window.__battleProbe()?.outgoingForecast?.length === 0)
  if (await page.locator('.enemy-card.affected').count() !== 0) throw new Error('Enemy damage preview did not clear after the planned attack landed')
  await page.screenshot({ path: join(SHOTS, '13-action-effect.png') })
  const vfxActive = await page.evaluate(() => window.__vfxProbe?.())
  if (
    !vfxActive ||
    vfxActive.setting !== 'high' ||
    vfxActive.tier !== 'high' ||
    vfxActive.backend !== 'webgl2' ||
    vfxActive.totalRenderedFrames < 1 ||
    (vfxActive.peakParticles < 1 && vfxActive.peakRibbons < 1) ||
    vfxActive.vramBytesApprox >= 12 * 1024 * 1024
  ) {
    throw new Error(`2.5D WebGL2 VFX did not render during strike: ${JSON.stringify(vfxActive)}`)
  }
  await page.evaluate(() => { window.__battleProbe().reducedMotion = true })
  await waitPhase(['planning'])
  let state = await snapshot()
  if (state.playerAttackResolved || state.enemyPhaseIndex !== 0 || Object.keys(state.enemyResourcePreviews).length) {
    throw new Error('Event-driven HP previews did not reset for the next planning turn')
  }
  if (state.enemies[0].robustness !== 61) throw new Error(`Opening Bash expected B01 at 61, got ${state.enemies[0].robustness}`)
  if (state.playerTrail.length !== 1 || state.playerTrail[0].x !== 7 || state.playerTrail[0].y !== 5) {
    throw new Error(`Gray trail did not clear at turn completion: ${JSON.stringify(state.playerTrail)}`)
  }
  const openingEffects = await page.evaluate(() => window.__attackEffects)
  if (openingEffects.length < 2 || openingEffects[0].source !== 'player' || openingEffects[1].source !== 'player') {
    throw new Error(`Player attacks were not emitted sequentially: ${JSON.stringify(openingEffects)}`)
  }
  if (openingEffects[0].fx !== 'base' || openingEffects[1].fx !== 'manhattan'
    || openingEffects[0].stepIndex !== 0 || openingEffects[1].stepIndex !== 1) {
    throw new Error(`Action-specific effect identities are missing: ${JSON.stringify(openingEffects.slice(0, 2))}`)
  }

  let overloadUsed = false
  // This playthrough checks the flow to the victory screen, not the balance.
  // bestRoute ignores incoming damage, so it gets extra Sanity to survive.
  await page.evaluate(() => { const player = window.__battleProbe().player; player.maxSanity = 300; player.sanity = 300 })
  let stageTwoSeen = false
  let curtainLockSeen = false
  for (let turn = 0; turn < 45; turn++) {
    state = await snapshot()
    if (state.phase !== 'planning') break
    if (state.enemies[0].stage === 2 && !stageTwoSeen) {
      stageTwoSeen = true
      await page.screenshot({ path: join(SHOTS, '10-warden-stage-two.png') })
    }
    if (state.curtains.some(curtain => curtain.locked) && !curtainLockSeen) {
      curtainLockSeen = true
      await page.screenshot({ path: join(SHOTS, '11-curtain-lock.png') })
    }
    const triggerOverload = state.player.overload >= 5
    if (triggerOverload) overloadUsed = true
    await playRoute(state, false, triggerOverload)
  }
  state = await snapshot()
  if (state.enemies[0].stage === 2) stageTwoSeen = true
  if (state.phase !== 'victory') throw new Error(`Autoplay did not reach victory; ended at ${state.phase} on turn ${state.turn} with Sanity ${state.player.sanity}`)
  if (!stageTwoSeen) throw new Error('Warden Breakdown was not reached during the boss playthrough')
  if (!curtainLockSeen) throw new Error('No active Curtain lock was observed during the boss playthrough')
  const effectSources = await page.evaluate(() => [...new Set(window.__attackEffects.map(effect => effect.source))])
  if (!effectSources.includes('enemy')) throw new Error('No enemy attack effect was emitted during the boss playthrough')
  const victoryStats = { turn: state.turn, sanity: state.player.sanity }
  await page.screenshot({ path: join(SHOTS, '06-victory.png') })

  await page.keyboard.press('KeyR')
  await waitPhase(['planning'])
  for (let turn = 0; turn < 20; turn++) {
    state = await snapshot()
    if (state.phase !== 'planning') break
    if (state.player.overload >= 5) {
      overloadUsed = true
      await page.evaluate(() => { window.__battleProbe().reducedMotion = false })
      await playRoute(state, false, true, join(SHOTS, '08b-vfx-overload-3d.png'))
      await page.evaluate(() => { window.__battleProbe().reducedMotion = true })
      break
    }
    await playRoute(state, true)
  }
  if (!overloadUsed) throw new Error('Overload was not triggered during the resource-collection run')

  state = await snapshot()
  if (state.phase === 'planning') {
    await page.getByRole('button', { name: 'Open settings' }).click()
    await page.getByRole('button', { name: /RESTART BATTLE/ }).click()
  } else {
    await page.keyboard.press('KeyR')
  }
  await waitPhase(['planning'])
  for (let turn = 0; turn < 80; turn++) {
    state = await snapshot()
    if (state.phase === 'gameover') break
    await page.getByRole('button', { name: /EXECUTE ROUTE/ }).click()
    await waitPhase(['planning', 'gameover'])
  }
  state = await snapshot()
  if (state.phase !== 'gameover') throw new Error(`Idle play ended at ${state.phase}, turn ${state.turn}, Sanity ${state.player.sanity}, enemy HP ${state.enemies.map(enemy => enemy.robustness).join('/')}`)
  await page.screenshot({ path: join(SHOTS, '07-eliminated.png') })
  await page.keyboard.press('KeyR')
  await waitPhase(['planning'])

  await page.setViewportSize({ width: 1024, height: 768 })
  await page.waitForTimeout(200)
  const canvasBox = await page.locator('#game-canvas').boundingBox()
  if (!canvasBox || canvasBox.width < 300 || canvasBox.height < 400) throw new Error('Board did not resize correctly')
  await page.screenshot({ path: join(SHOTS, '09-resized.png') })
  const performance = await page.evaluate(async () => {
    const samples = []
    let previous = window.performance.now()
    for (let i = 0; i < 60; i++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve))
      samples.push(now - previous)
      previous = now
    }
    const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
    return { averageMs: Number(averageMs.toFixed(2)), fps: Number((1000 / averageMs).toFixed(1)), warps: 225 }
  })

  // Exercise WebGL context loss + restoration and verify seamless 2D fallback + zero errors
  await page.evaluate(() => {
    const vfxCanvas = document.querySelector('.vfx-canvas')
    const gl = vfxCanvas?.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_lose_context')
    window.__testLoseCtx = ext ?? null
    ext?.loseContext()
  })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const vfxLost = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxLost || !vfxLost.contextLost || vfxLost.backend !== '2d') {
    throw new Error(`VFX failed to enter 2D fallback on WebGL context loss: ${JSON.stringify(vfxLost)}`)
  }
  await page.evaluate(() => { window.__testLoseCtx?.restoreContext?.() })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const vfxRestored = await page.evaluate(() => window.__vfxProbe?.())
  if (!vfxRestored || vfxRestored.contextLost || vfxRestored.backend !== 'webgl2') {
    throw new Error(`VFX failed to recover WebGL2 context on restore: ${JSON.stringify(vfxRestored)}`)
  }

  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({
    result: 'PASS', openingDamage: 3, victory: true, victoryStats, elimination: true,
    overloadTriggeredInBrowser: overloadUsed, menus: true, settings: true,
    restart: true, resized: true, performance,
    vfx: { tier: vfxActive.tier, hdrFloat: vfxActive.hdrFloat, peakParticles: vfxActive.peakParticles, peakRibbons: vfxActive.peakRibbons, vramBytesApprox: vfxActive.vramBytesApprox, contextRecovery: true },
    consoleErrors: 0,
  }, null, 2))
} finally {
  await browser.close()
  server.close()
}
