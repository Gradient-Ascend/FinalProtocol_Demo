// The opening sequence: the AI wakes. Text shaded by real attention, an
// image cut into 196 patches, sound in 80 ms frames, then representation
// space. One canvas, one clock (plan.ts), one score.
//
//   const intro = mountIntro(root, { reducedMotion, muted, onDone })
//   ...
//   intro.dispose()
//
// It owns its canvas, its animation loop (paused while the tab is hidden) and
// its key and pointer listeners, and gives all of them back in dispose().
import { MONO, drawSpectators, span } from '../display'
import { PointField } from '../point-field'
import { layoutOf, Subtitle, WHITE, font, type Frame, type Layout } from './common'
import { CG } from './data'
import { PLAN, shotAt, type ShotId } from './plan'
import { Score } from './score'
import { AudioShot } from './shot-audio'
import { ImageShot } from './shot-image'
import { LatentShot } from './shot-latent'
import { TextShot } from './shot-text'
import { TitleShot } from './shot-title'

export type IntroOptions = {
  reducedMotion: boolean
  muted: boolean
  onDone: () => void
  startAt?: number       // seconds into the sequence (for building and testing)
  speed?: number         // clock multiplier; sound plays only at 1
}

export type IntroProbe = { t: number; shot: ShotId; done: boolean; frames: number; frameMs: number }
export type IntroHandle = { dispose(): void; skip(): void; probe(): IntroProbe }

const HOLD_MS = 600

export function mountIntro(root: HTMLElement, opts: IntroOptions): IntroHandle {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;background:#000;touch-action:none;user-select:none;-webkit-user-select:none'
  canvas.setAttribute('aria-hidden', 'true')
  root.appendChild(canvas)
  // The words, for anyone who is not shown the picture.
  const log = document.createElement('div')
  log.setAttribute('role', 'log')
  log.setAttribute('aria-live', 'polite')
  log.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'
  root.appendChild(log)

  const ctx = canvas.getContext('2d', { alpha: false })
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1
  const score = new Score(opts.muted, speed)
  const shots = { text: new TextShot(), image: new ImageShot(), audio: new AudioShot(), latent: new LatentShot(), title: new TitleShot() }
  const subtitle = new Subtitle()
  const field = new PointField()
  const spoken = new Set<string>()

  let t = Math.max(0, Math.min(PLAN.length, opts.startAt ?? 0))
  let last = 0
  let raf = 0
  let snap = true                    // first frame, and the first after a pause: eases jump to their goals
  let done = false
  let disposed = false
  let width = 0, height = 0, dpr = 1
  let layout: Layout = layoutOf(1, 1)
  let sized = false
  let holdFrom = 0                   // performance.now() when a key or pointer went down
  let held = 0                       // keys and pointers currently down
  let nudged = -1e9                  // last time the viewer touched anything: the hint answers
  let frames = 0, frameMs = 0

  const resize = () => { sized = false }

  function applySize(): void {
    sized = true
    width = Math.max(1, canvas.clientWidth || window.innerWidth)
    height = Math.max(1, canvas.clientHeight || window.innerHeight)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    layout = layoutOf(width, height)
    field.resize(width, height, dpr)
  }

  function announce(): void {
    for (const cue of [...PLAN.textLines, ...PLAN.subtitles]) {
      if (t < cue.end || spoken.has(cue.line.id)) continue
      spoken.add(cue.line.id)
      const p = document.createElement('p')
      p.textContent = cue.line.text
      log.appendChild(p)
    }
  }

  function draw(dt: number, now: number): void {
    if (!ctx) return
    if (!sized) applySize()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#000'           // darker than the game's own black, so the game later feels lit
    ctx.fillRect(0, 0, width, height)

    const f: Frame = { ctx, field, w: width, h: height, dpr, t, dt, reduced: opts.reducedMotion, hud: [], hudAlpha: 1, voiceAt: score.voicePosition() }
    const shot = shotAt(t)
    if (shot === 'wake' || shot === 'text') shots.text.draw(f, layout)
    else if (shot === 'image') shots.image.draw(f, layout)
    else if (shot === 'audio') shots.audio.draw(f, layout)
    else if (shot === 'latent') shots.latent.draw(f, layout)
    else shots.title.draw(f, layout)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (shot !== 'title') subtitle.draw(f, layout, PLAN.subtitles)

    // read-out, bottom-left: what is on screen, and where it came from
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.font = font(layout.hudFs)
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if (!layout.small && 'letterSpacing' in spaced) spaced.letterSpacing = '0.06em'
    const lift = layout.small ? layout.hudFs + 8 : 0             // on a phone the skip hint has the last line to itself
    f.hud.forEach((line, i) => {
      const a = 0.52 * f.hudAlpha * (line.alpha ?? 1)
      if (a <= 0.004) return
      ctx.fillStyle = `rgba(${WHITE},${a.toFixed(3)})`
      ctx.fillText(line.text, layout.margin, height - layout.margin - lift - (f.hud.length - 1 - i) * (layout.hudFs + 7))
    })

    // the way out: hold anything
    const hintIn = span(t, (opts.startAt ?? 0) + 1.5, 0.8)
    if (hintIn > 0 && !done) {
      const holding = holdFrom ? Math.min(1, (now - holdFrom) / HOLD_MS) : 0
      const answer = 1 - span(now, nudged + 900, 900)
      ctx.textAlign = 'right'
      ctx.fillStyle = `rgba(${WHITE},${(hintIn * (0.3 + 0.35 * Math.max(holding, answer))).toFixed(3)})`
      ctx.fillText(CG.skipHint, width - layout.margin, height - layout.margin)
      if (holding > 0) {
        const w = ctx.measureText(CG.skipHint).width
        ctx.fillRect(width - layout.margin - w, height - layout.margin + 5, w * holding, 1)
      }
    }
    if ('letterSpacing' in spaced) spaced.letterSpacing = '0px'

    drawSpectators(ctx, width)
  }

  function finish(): void {
    if (done) return
    done = true
    score.stop(0.06)
    opts.onDone()
  }

  function frame(now: number): void {
    raf = 0
    if (disposed) return
    const real = last ? Math.min(0.05, (now - last) / 1000) : 0   // a stall cannot skip a transition
    last = now
    if (!done) t = Math.min(PLAN.length, t + real * speed)
    const started = performance.now()
    try {
      draw(snap ? 10 : real * speed, now)
    } catch (error) {
      // A picture that cannot be drawn must not strand the player before the game.
      console.error('[intro]', error)
      finish()
      return
    }
    snap = false
    frames++
    frameMs = performance.now() - started
    if (!done) {
      score.update(t)
      announce()
      if (holdFrom && now - holdFrom >= HOLD_MS) { skip(); return }
      if (t >= PLAN.length) { finish(); return }
      if (!document.hidden) raf = requestAnimationFrame(frame)
    }
  }

  function skip(): void {
    if (done || disposed) return
    t = PLAN.length
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    finish()
  }

  const down = () => {
    held++
    nudged = performance.now()
    if (!holdFrom) holdFrom = nudged
    score.gesture()
  }
  const up = () => {
    held = Math.max(0, held - 1)
    if (!held) holdFrom = 0
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift') return
    down()
  }
  const onKeyUp = () => up()
  const onPointerDown = () => down()
  const onPointerUp = () => up()
  const onBlur = () => { held = 0; holdFrom = 0 }
  const onVisibility = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      held = 0
      holdFrom = 0
    } else if (!raf && !done && !disposed) {
      last = 0
      raf = requestAnimationFrame(frame)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', resize)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  document.addEventListener('visibilitychange', onVisibility)

  // The heavy one-time work (the picture, the chant, the wall of matrices, the field) happens in the dark of shot 0.
  const warm = window.setTimeout(() => {
    try {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight
      shots.image.prepare(layoutOf(w, h).small)
      shots.audio.prepare()
      shots.text.prepare()
      shots.latent.prepare(w, h)
    } catch (error) {
      console.error('[intro]', error)
    }
  }, 60)

  // Lay text out with the real face if it is still on its way.
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
  void fonts?.ready.then(() => { if (!disposed) sized = false }).catch(() => undefined)
  void MONO

  if (!document.hidden) raf = requestAnimationFrame(frame)

  return {
    skip,
    probe: () => ({ t, shot: shotAt(t), done, frames, frameMs }),
    dispose() {
      if (disposed) return
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.clearTimeout(warm)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.removeEventListener('visibilitychange', onVisibility)
      score.stop(0.06)
      canvas.remove()
      log.remove()
    },
  }
}
