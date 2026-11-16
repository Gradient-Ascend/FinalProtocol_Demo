// What every display moment shares: the runner (one canvas, the beat clock,
// sound cues, skip, release), where the real board sits on screen, a picture
// of that board drawn from the encounter, and a few drawing helpers.
//
// A moment paints its whole canvas and meets the screen under it only through
// the canvas element's opacity (`cover`), so additive drawing behaves and a
// moment can end on a picture that matches what is underneath and simply
// fade. The one exception is a moment that is a hole in the game: it leaves
// the canvas clear everywhere but the hole.
//
// Two things learnt by measuring, which the moments keep to: a path filled
// or clipped in the same frame as PointField.end() costs Chrome 40 to 90 ms
// at 1440 by 900 on a 2x screen, and so does a stroked hairline mesh. Shapes
// that do not change are drawn once to a picture; hairlines are fillRects.
import script from '../story/script.json'
import { campaignStore } from '../campaign/campaign-store'
import { BOARD_COLORS, SIGN_LOOKS, boardFit, drawSignCell, signMask, type SignLook } from '../game/battle-renderer'
import type { Encounter } from '../game/encounters'
import { Display, MONO, SPECTATOR, clamp01, spectatorDots, type Beat } from './display'
import { PointField } from './point-field'
import { canUnlock, restore, setMuted, sharedAudio, unlockAudio, type Handle, type Sound } from './sound'

export type StageOptions = {
  // Where to draw: a full-viewport element the caller owns and removes.
  host: HTMLElement
  reducedMotion: boolean
  muted: boolean
  // Long form on first viewing, short form (3 s or less) afterwards.
  short?: boolean
  // For building and checking: start this many seconds in; run the clock at
  // this multiple (sound plays only at 1).
  startAt?: number
  speed?: number
  // The moment listens for a held key or pointer (0.6 s) and skips itself.
  // Pass false if the caller wants to be the only way out.
  input?: boolean
}

export type StageHandle = { done: Promise<void>; skip: () => void }

// Top-left of the 15 by 15 board and the size of a cell, in the moment's own CSS pixels.
export type BoardGeo = { x: number; y: number; cell: number }

export type Frame = {
  ctx: CanvasRenderingContext2D    // units are CSS pixels
  field: PointField                // an additive point buffer the size of the frame
  w: number
  h: number
  dpr: number
  t: number                        // seconds on the moment's clock
  dt: number
  now: number                      // wall clock, seconds: for idle motion that must not stop with the beat clock
  reduced: boolean
  small: boolean                   // a phone
  geo: BoardGeo
  pointer: { x: number; y: number } | null   // where a mouse is, in the moment's pixels; null for touch or none
}

// What a moment is built for; a change of size builds it again.
export type Env = { w: number; h: number; dpr: number; small: boolean; reduced: boolean; short: boolean; geo: BoardGeo }

export type Keep = <T extends Handle>(handle: T, release?: number) => T
export type Cue = { at: number; fire: (s: Sound, when: number, keep: Keep) => void }

export type Moment = {
  length: number
  draw(f: Frame): void
  // How much of the screen underneath the moment covers at time t, 0..1.
  cover(t: number): number
  cues?: Cue[]
  // How many of the three spectators carry their god's hue. Left out, the run's layer decides.
  entered?: number
  // 0 normally; 1 when attention is on the spectators and they show at full strength. Only the ending moves it.
  spectators?: (t: number) => number
}

const HOLD_MS = 600
const DEAF_MS = 400                  // input in the first moments belongs to whatever started us

type Probe = { t: number; done: boolean; length: number }
let probe: Probe | null = null
/** The moment now playing (or the last one), for the preview page and scripts. */
export function stageProbe(): Probe | null { return probe }
let seeker: ((t: number) => void) | null = null
/** Move the playing moment's clock (no sound is replayed). For building and checking only. */
export function stageSeek(t: number): void { seeker?.(t) }

export const LAYER_HUES = ['#9FCB6B', '#C4162E', '#FFC857']

export function runMoment(kind: string, options: StageOptions, build: (env: Env) => Moment): StageHandle {
  let finish: () => void = () => undefined
  const done = new Promise<void>(resolve => { finish = resolve })
  const host = options.host
  const canvas = document.createElement('canvas')
  // A host with no box of its own (no stylesheet yet) still gets a full-viewport picture.
  const boxed = host.clientWidth > 0 && host.clientHeight > 0
  canvas.style.cssText = `position:${boxed ? 'absolute' : 'fixed'};inset:0;width:100%;height:100%;display:block;opacity:0;touch-action:none;user-select:none;-webkit-user-select:none`
  canvas.setAttribute('aria-hidden', 'true')
  canvas.dataset.stage = kind
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  const field = new PointField()
  const speed = options.speed && options.speed > 0 ? options.speed : 1

  // Sound: everything a moment plays goes through three gains of its own, so
  // a skip can take all of it away at once, scheduled notes included.
  let sound: Sound | null = null
  let stems: GainNode[] = []
  const kept: { handle: Handle; release: number }[] = []
  const keep: Keep = (handle, release = 1.2) => { kept.push({ handle, release }); return handle }
  function wire(): void {
    if (sound || speed !== 1) return
    try {
      const shared = sharedAudio() ?? (canUnlock() ? unlockAudio() : null)
      if (!shared) return
      setMuted(options.muted)
      const { ctx: audio, master } = shared
      const stem = (to: GainNode) => { const g = audio.createGain(); g.connect(to); return g }
      stems = [stem(master.music), stem(master.sfx), stem(master.wet)]
      sound = { ctx: audio, master: { music: stems[0], sfx: stems[1], wet: stems[2], cut: master.cut, user: master.user } }
    } catch { sound = null }
  }
  wire()

  let width = 0, height = 0, dpr = 1
  let moment: Moment | null = null
  let display: Display | null = null
  let over = false
  let raf = 0
  let last = 0
  let opacity = -1
  let holdFrom = 0, held = 0
  const born = performance.now()
  const entered = () => Math.min(3, campaignStore.getSnapshot().run?.layer ?? 0)

  function geoNow(): BoardGeo {
    const board = document.getElementById('game-canvas')
    const view = window.__mapProbe
    if (board && view && board.clientWidth > 0) {
      try {
        const a = board.getBoundingClientRect(), b = canvas.getBoundingClientRect(), v = view()
        if (v.cell > 0) return { x: a.left - b.left + v.x, y: a.top - b.top + v.y, cell: v.cell }
      } catch { /* fall through */ }
    }
    return boardFit(width, height)
  }

  const frame: Frame = { ctx: ctx as CanvasRenderingContext2D, field, w: 0, h: 0, dpr: 1, t: 0, dt: 0, now: 0, reduced: options.reducedMotion, small: false, geo: { x: 0, y: 0, cell: 1 }, pointer: null }

  function measure(): void {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth), h = Math.max(1, canvas.clientHeight || window.innerHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const resized = w !== width || h !== height || ratio !== dpr
    if (resized) {
      width = w; height = h; dpr = ratio
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
      field.resize(w, h, ratio)
    }
    const geo = geoNow()
    const moved = geo.x !== frame.geo.x || geo.y !== frame.geo.y || geo.cell !== frame.geo.cell
    if (!resized && !moved && moment) return
    frame.w = w; frame.h = h; frame.dpr = ratio; frame.small = Math.min(w, h) < 600; frame.geo = geo
    // A moment is laid out for one size of screen: a new size lays it out again, on the same clock.
    moment = build({ w, h, dpr: ratio, small: frame.small, reduced: options.reducedMotion, short: !!options.short, geo })
    if (!display) {
      const beats: Beat[] = [{ at: 0, dur: moment.length, smooth: true, draw: (_k, t) => paint(t) }]
      for (const cue of moment.cues ?? []) {
        beats.push({ at: cue.at, dur: 0, cue: when => { if (sound) { try { cue.fire(sound, when + 0.03, keep) } catch (error) { console.error('[stage] sound', error) } } } })
      }
      display = new Display(beats, { get currentTime() { return sound ? sound.ctx.currentTime : 0 } }, false)
      if (options.startAt) display.seek(Math.min(options.startAt, moment.length - 0.001))
      probe = { t: display.time, done: false, length: moment.length }
      const playing = display, length = moment.length
      seeker = t => playing.seek(Math.max(0, Math.min(t, length - 0.001)))
    }
  }

  function paint(t: number): void {
    if (!ctx || !moment) return
    frame.t = t
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, width, height)
    moment.draw(frame)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // The three who watch: where the opening put them.
    const lit = moment.entered ?? entered()
    const attended = clamp01(moment.spectators ? moment.spectators(t) : 0)
    spectatorDots(width).forEach(([x, y], i) => {
      const hue = i < lit ? LAYER_HUES[i] : null
      const rest = hue ? 0.2 : 0.06
      ctx.globalAlpha = rest + (1 - rest) * attended
      ctx.fillStyle = hue ?? '#ffffff'
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, SPECTATOR.size, SPECTATOR.size)
    })
    ctx.globalAlpha = 1
    // The way out, shown only to someone reaching for it.
    if (holdFrom) {
      const k = Math.min(1, (performance.now() - holdFrom) / HOLD_MS)
      const text = script.cg.skipHint, pad = frame.small ? 16 : 28
      ctx.font = `400 ${frame.small ? 9 : 10}px ${MONO}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = `rgba(245,245,245,${(0.3 + 0.35 * k).toFixed(3)})`
      ctx.fillText(text, width - pad, height - pad)
      const tw = ctx.measureText(text).width
      ctx.fillRect(width - pad - tw, height - pad + 5, tw * k, 1)
    }
    const cover = clamp01(moment.cover(t))
    if (Math.abs(cover - opacity) > 0.002 || (cover === 0) !== (opacity === 0) || (cover === 1) !== (opacity === 1)) {
      opacity = cover
      canvas.style.opacity = cover.toFixed(3)
    }
  }

  function end(skipped: boolean): void {
    if (over) return
    over = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    canvas.removeEventListener('pointerdown', down)
    window.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('visibilitychange', onVisibility)
    if (sound) {
      try {
        const now = sound.ctx.currentTime
        let tail = 0.1
        for (const { handle, release } of kept) { handle.stop(now, skipped ? 0.06 : release); tail = Math.max(tail, skipped ? 0.1 : release) }
        // A skip takes away what was scheduled too; a natural end lets the last notes ring.
        if (skipped) for (const g of stems) { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.015) }
        restore(sound, now, 0.1)
        const old = stems
        window.setTimeout(() => { for (const g of old) { try { g.disconnect() } catch { /* gone */ } } }, (tail + 1.5) * 1000)
      } catch { /* a closed context is not our problem */ }
    }
    kept.length = 0
    seeker = null
    canvas.remove()
    if (probe) probe = { t: skipped ? probe.length : probe.t, done: true, length: probe.length }
    window.dispatchEvent(new CustomEvent('stage-moment', { detail: { kind, phase: 'end', skipped } }))
    finish()
  }

  function tick(now: number): void {
    raf = 0
    if (over) return
    const real = last ? Math.min(0.05, (now - last) / 1000) : 0     // a stall cannot jump a beat
    last = now
    try {
      measure()
      if (!display || !moment) { end(false); return }
      frame.dt = real * speed
      frame.now = now / 1000
      const running = display.step(real * speed)
      probe = { t: display.time, done: false, length: moment.length }
      if (holdFrom && performance.now() - holdFrom >= HOLD_MS) { end(true); return }
      if (!running) { end(false); return }
    } catch (error) {
      // A picture that cannot be drawn must not strand the player.
      console.error('[stage]', error)
      end(true)
      return
    }
    if (!document.hidden) raf = requestAnimationFrame(tick)
  }

  function down(): void {
    wire()
    if (options.input === false || performance.now() - born < DEAF_MS) return
    held++
    if (!holdFrom) holdFrom = performance.now()
  }
  function up(): void {
    held = Math.max(0, held - 1)
    if (!held) holdFrom = 0
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift') return
    down()
  }
  function onBlur(): void { held = 0; holdFrom = 0 }
  function onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') { frame.pointer = null; return }
    const box = canvas.getBoundingClientRect()
    frame.pointer = { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  function onVisibility(): void {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      held = 0
      holdFrom = 0
    } else if (!raf && !over) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', onBlur)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  canvas.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', onPointerMove)
  document.addEventListener('visibilitychange', onVisibility)
  window.dispatchEvent(new CustomEvent('stage-moment', { detail: { kind, phase: 'start' } }))

  if (!ctx) {
    // No canvas: the moment is over before it began, and says so on the next turn of the loop.
    window.setTimeout(() => end(true), 0)
  } else if (!document.hidden) raf = requestAnimationFrame(tick)
  else {
    // Started in a hidden tab: it waits for the tab, as the opening does.
  }

  return { done, skip: () => end(true) }
}

// ── Drawing helpers ──────────────────────────────────────────────────────

export const font = (px: number, weight = 400) => `${weight} ${px}px ${MONO}`
export const rgbOf = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
export const rgba = (hex: string, alpha: number) => { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})` }
export const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** A dot in the additive buffer, in CSS pixels. */
export function dot(f: Frame, x: number, y: number, size: number, c: [number, number, number], alpha: number): void {
  const s = f.field.scale
  f.field.splat(x * s, y * s, size * s, c[0], c[1], c[2], alpha)
}

/** Text set one character at a time around a centre, so tracking can be any width. Returns the width. */
export function trackedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, px: number, tracking: number, weight = 700): number {
  ctx.font = font(px, weight)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const chars = [...text]
  const advance = ctx.measureText('M').width + tracking * px
  const total = advance * (chars.length - 1)
  chars.forEach((ch, i) => { if (ch !== ' ') ctx.fillText(ch, cx - total / 2 + i * advance, y) })
  return total + advance
}

export type BoardPicture = {
  alpha?: number                   // the whole picture
  tiles?: number                   // cell fills and grid lines, 0..1
  labels?: number                  // the hex labels along the top and the left
  look?: SignLook | null           // the sign's colours (default: the encounter's god)
  // Per point of the sign: how it burns (1 is the board's rest level) and whether it shows at all.
  light?: (index: number) => number
  seen?: (index: number) => number
  ghosts?: number                  // 0 hides the points that are not walls here
  bare?: boolean                   // an unlit wall of the sign is not drawn at all
}

/** The board as the renderer draws it, without Warps or units: tiles, grid, labels and the sign. */
export function drawBoard(ctx: CanvasRenderingContext2D, geo: BoardGeo, encounter: Encounter, mask: Uint8Array, p: BoardPicture = {}): void {
  const { x: ox, y: oy, cell } = geo
  const all = p.alpha ?? 1
  if (all <= 0.003) return
  const tiles = (p.tiles ?? 1) * all
  ctx.save()
  if (tiles > 0.003) {
    ctx.globalAlpha = tiles
    ctx.lineWidth = 0.75
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const px = ox + x * cell, py = oy + y * cell
      ctx.fillStyle = mask[y * 15 + x] !== 2 && encounter.walls.some(([wx, wy]) => wx === x && wy === y) ? BOARD_COLORS.wall : BOARD_COLORS.cell
      ctx.fillRect(px, py, cell, cell)
      ctx.strokeStyle = BOARD_COLORS.grid
      ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1)
    }
  }
  const labels = (p.labels ?? 0) * all
  if (labels > 0.003) {
    ctx.globalAlpha = labels
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.fillStyle = BOARD_COLORS.muted
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < 15; i++) {
      const label = i.toString(16).toUpperCase()
      ctx.fillText(label, ox + (i + 0.5) * cell, oy - 7)
      ctx.fillText(label, ox - 17, oy + (i + 0.5) * cell)
    }
  }
  const look = p.look === undefined ? SIGN_LOOKS[encounter.god] : p.look
  if (look) {
    ctx.globalAlpha = all
    for (let i = 0; i < 225; i++) {
      if (!mask[i] || (mask[i] === 1 && p.ghosts === 0)) continue
      drawSignCell(ctx, ox + (i % 15) * cell, oy + Math.floor(i / 15) * cell, cell, look, mask[i] === 2, p.light ? p.light(i) : 1, p.seen ? p.seen(i) : 1, p.bare)
    }
  }
  ctx.restore()
}

/**
 * The real board, as it is on screen this frame, copied into the moment at
 * its own place. False where there is no board to copy (the preview without
 * one): the caller draws a picture instead.
 */
export function drawLiveBoard(ctx: CanvasRenderingContext2D, geo: BoardGeo, alpha = 1, margin = 0): boolean {
  const board = document.getElementById('game-canvas') as HTMLCanvasElement | null
  if (!board || !board.width || !board.clientWidth || !window.__mapProbe) return false
  try {
    const view = window.__mapProbe()
    const scale = board.width / board.clientWidth
    const m = margin * geo.cell, side = geo.cell * 15 + m * 2
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(board, (view.x - m) * scale, (view.y - m) * scale, side * scale, side * scale, geo.x - m, geo.y - m, side, side)
    ctx.restore()
    return true
  } catch {
    return false
  }
}

export { signMask }
