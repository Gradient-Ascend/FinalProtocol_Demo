import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const DIST = join(ROOT, 'dist')
const SHOTS = join(ROOT, 'verification-shots')
mkdirSync(SHOTS, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  try {
    const raw = req.url === '/' ? '/index.html' : req.url.split('?')[0]
    const file = resolve(DIST, '.' + decodeURIComponent(raw))
    if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return }
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, resolve))
const port = server.address().port
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
})
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

function bestRoute(state, focusOverload = false) {
  const enemies = state.enemies.filter(enemy => enemy.robustness > 0)
  const blocked = new Set(enemies.map(enemy => `${enemy.pos.x},${enemy.pos.y}`))
  for (const curtain of state.curtains.filter(item => item.locked)) {
    for (let i = 0; i < 15; i++) {
      const pos = curtain.axis === 'column' ? { x: curtain.index, y: i } : { x: i, y: curtain.index }
      blocked.add(`${pos.x},${pos.y}`)
    }
  }
  let best = { path: [], score: -1e9 }
  const start = state.player.pos
  function walk(pos, path, visited) {
    if (path.length) {
      const counts = { bash: 0, core: 0, privilege: 0, overload: 0, blank: 0 }
      for (const step of path) counts[state.flags[step.y][step.x]]++
      const distance = Math.min(...enemies.map(enemy => Math.abs(enemy.pos.x - pos.x) + Math.abs(enemy.pos.y - pos.y)))
      const releases = Math.min(counts.bash, 8 - path.length, 4)
      const score = releases * 15 + counts.core * 5 + counts.privilege * 3 + counts.overload * (focusOverload ? 80 : 7) - distance * 1.4 + path.length * .15
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

async function playRoute(state, focusOverload = false, triggerOverload = false) {
  const route = bestRoute(state, focusOverload)
  let cursor = state.player.pos
  for (const next of route) {
    await page.keyboard.press(keyFor(cursor, next))
    cursor = next
  }
  if (triggerOverload) {
    await page.keyboard.press('KeyO')
    if (!(await snapshot()).overloadArmed) throw new Error('First O did not arm Overload preview')
    const overloadPreview = await page.locator('.overload-preview-value').textContent()
    if (!overloadPreview || (!/−\d+/.test(overloadPreview) && overloadPreview.trim() !== 'NO TARGET')) {
      throw new Error(`Overload damage preview is missing: ${overloadPreview}`)
    }
    await page.screenshot({ path: join(SHOTS, '08-overload.png') })
    await page.keyboard.press('KeyO')
    if ((await snapshot()).overloadArmed) throw new Error('Second O did not release Overload')
  }
  await page.getByRole('button', { name: /EXECUTE ROUTE/ }).click()
  await waitPhase(['planning', 'victory', 'gameover'])
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__GAME_READY__ === true)
  await page.getByRole('button', { name: /BREACH SANDBOX/ }).click()
  await waitPhase(['planning'])
  if (await page.locator('.enemy-card').count() !== 0) throw new Error('Unaffected Geeks should be hidden before planning')
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
  await page.screenshot({ path: join(SHOTS, '04-settings.png') })
  await page.getByRole('button', { name: 'Close' }).click()

  if (await page.locator('.incoming-preview').count() !== 1) throw new Error('Missing incoming Sanity damage preview')
  const playerBar = await page.locator('.player-sanity').evaluate(element => {
    const label = element.getAttribute('aria-label') ?? ''
    const projected = Number(label.match(/Projected Sanity (\d+)/)?.[1])
    const max = Number(label.match(/of (\d+)/)?.[1])
    const current = element.querySelector('.health-current')
    const left = element.querySelector('.incoming-segment.left-edge')
    const right = element.querySelector('.incoming-segment.right-edge')
    return {
      remainingWidth: Number.parseFloat(current.style.width),
      expectedWidth: projected / max * 100,
      opacity: Number.parseFloat(getComputedStyle(current).opacity),
      remainingRadius: getComputedStyle(current).borderTopRightRadius,
      leftRadius: getComputedStyle(left).borderTopLeftRadius,
      rightRadius: getComputedStyle(right).borderTopRightRadius,
    }
  })
  if (Math.abs(playerBar.remainingWidth - playerBar.expectedWidth) > 0.01) throw new Error(`Player HP does not end at the projected value: ${JSON.stringify(playerBar)}`)
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
  if (await page.locator('.enemy-card').count() !== 1) throw new Error('Expected exactly one affected Geek')
  const previewColor = await page.locator('.damage-preview').evaluate(element => getComputedStyle(element).color)
  if (previewColor !== 'rgb(242, 209, 107)') throw new Error(`Damage preview is not yellow: ${previewColor}`)
  const projected = await page.locator('.to-be').textContent()
  if (!projected?.includes('34')) throw new Error(`Missing projected Desire value: ${projected}`)
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
  if (!(await page.locator('.damage-preview').textContent())?.includes('THIS ACTION')) throw new Error('Single-action damage preview did not activate')
  if (await page.locator('.enemy-card .health-segment').count() !== 1) throw new Error('Expected only the hovered action segment in the HP bar')
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
  const currentHp = (await snapshot()).enemies[0]
  const projectedHp = Number((await page.locator('.enemy-card .enemy-hp .to-be').first().textContent())?.replace('→', '').trim())
  const expectedWidth = projectedHp / currentHp.maxRobustness * 100
  if (Math.abs(remainingWidth - expectedWidth) > 0.01) throw new Error(`Remaining HP does not end at the projected value: ${remainingWidth} vs ${expectedWidth}`)
  const originalOpacity = await page.locator('.enemy-card .health-current').first().evaluate(element => Number.parseFloat(getComputedStyle(element).opacity))
  if (originalOpacity !== 1) throw new Error(`Remaining HP must stay solid outside the replacement segments: ${originalOpacity}`)
  const segmentColor = await page.locator('.enemy-card .health-segment.segment-1').first().evaluate(element => getComputedStyle(element).backgroundColor)
  if (!['rgb(242, 209, 107)', 'rgba(242, 209, 107, 0.78)'].includes(segmentColor)) throw new Error(`Outgoing preview is not GDD yellow: ${segmentColor}`)
  await page.locator('.enemy-card .health-segment').nth(0).hover()
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
  if (await page.locator('.incoming-preview').count() !== 1) throw new Error('Incoming preview did not remain live during route resolution')
  await page.waitForFunction(() => window.__attackEffects.length > 0)
  await page.waitForFunction(() => window.__battleProbe()?.playerAttackResolved === true)
  if (await page.locator('.enemy-card').count() !== 0) throw new Error('Enemy damage preview did not clear after the planned attack landed')
  await page.screenshot({ path: join(SHOTS, '13-action-effect.png') })
  await page.evaluate(() => { window.__battleProbe().reducedMotion = true })
  await waitPhase(['planning'])
  let state = await snapshot()
  if (state.playerAttackResolved || state.enemyPhaseIndex !== 0 || Object.keys(state.enemyResourcePreviews).length) {
    throw new Error('Event-driven HP previews did not reset for the next planning turn')
  }
  if (state.enemies[0].robustness !== 34) throw new Error(`Opening Bash expected B01 at 34, got ${state.enemies[0].robustness}`)
  if (state.playerTrail.length !== 1 || state.playerTrail[0].x !== 7 || state.playerTrail[0].y !== 5) {
    throw new Error(`Gray trail did not clear at turn completion: ${JSON.stringify(state.playerTrail)}`)
  }
  const openingEffects = await page.evaluate(() => window.__attackEffects)
  if (openingEffects.length < 2 || openingEffects[0].source !== 'player' || openingEffects[1].source !== 'player') {
    throw new Error(`Player attacks were not emitted sequentially: ${JSON.stringify(openingEffects)}`)
  }
  if (openingEffects[0].presetId !== 'vector' || openingEffects[1].presetId !== 'vector'
    || openingEffects[0].stepIndex !== 0 || openingEffects[1].stepIndex !== 1) {
    throw new Error(`Action-specific effect identities are missing: ${JSON.stringify(openingEffects.slice(0, 2))}`)
  }

  let overloadUsed = false
  let stageTwoSeen = false
  let curtainLockSeen = false
  for (let turn = 0; turn < 20; turn++) {
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
      await playRoute(state, true, true)
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

  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({
    result: 'PASS', openingDamage: 2, victory: true, victoryStats, elimination: true,
    overloadTriggeredInBrowser: overloadUsed, menus: true, settings: true,
    restart: true, resized: true, performance, consoleErrors: 0,
  }, null, 2))
} finally {
  await browser.close()
  server.close()
}
