// The three boss entrances. Each god has one verb and breaks one law of the
// interface: the Yeanling multiplies (the grid divides past counting, then
// something too tall for the screen sets a foot down); the Queen performs (a
// fanfare that resolves wrongly, black, a mask too large for the frame with
// the board in its eye); the last one withholds (silence, a sign that will
// not finish, no name, and the player's own amber turning out to be its).
//
// Every entrance draws its own picture of the board from the encounter and
// ends on that picture at rest, where the real board is, so fading it out is
// the battle beginning.
import script from '../story/script.json'
import { amberMemory } from '../game/attack-fx'
import { inAttackRange } from '../game/attack-methods'
import { BOARD_COLORS, SIGN_LOOKS, type SignLook } from '../game/battle-renderer'
import { battleStore } from '../game/battle-store'
import { WARDEN_ENCOUNTER, type Encounter } from '../game/encounters'
import { clamp01, easeInOutCubic, easeOutCubic, lerp, smoother, span, stepped } from './display'
import { PointField, mulberry32 } from './point-field'
import { glowSprite } from './sigil-dots'
import { blip, both, brass, courtFanfare, driftCluster, footfall, lowTone, noiseTick, pulseTrain, restore, silence, vowel } from './sound'
import { dot, drawBoard, font, rgbOf, rgba, signMask, trackedText, type Cue, type Env, type Frame, type Moment } from './stage-kit'

const TAU = Math.PI * 2
const WHITE = '#f5f5f5'

export const bossOf = (encounter: Encounter) => encounter.enemies.find(enemy => enemy.bossStages?.length) ?? encounter.enemies[0]
const bossText = (layer: number) => (script.layers[layer] as { boss?: { name: string; epithet: string } }).boss ?? { name: '', epithet: '' }

// A point of the sign catching: full brightness at once, settling a little
// under it. Brightness only rises on the way in, so no point is a flash.
function burn(age: number): { light: number; seen: number } {
  if (age <= 0) return { light: 1, seen: 0 }
  return { light: 1.45 + 0.55 * Math.exp(-Math.max(0, age - 0.09) / 0.3), seen: Math.min(1, age / 0.09) }
}

// The glow of points that have just caught, and the six sparks each throws along its cell.
function ignitions(f: Frame, mask: Uint8Array, litAt: Float32Array, hue: string, alpha = 1): void {
  const { ctx, geo, t } = f
  const sprite = glowSprite(hue)
  const c = rgbOf(hue)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 225; i++) {
    const age = t - litAt[i]
    if (mask[i] !== 2 || age <= 0 || age > 0.9) continue
    const cx = geo.x + (i % 15 + 0.5) * geo.cell, cy = geo.y + (Math.floor(i / 15) + 0.5) * geo.cell
    const size = geo.cell * 1.5
    ctx.globalAlpha = 0.55 * alpha * Math.exp(-age / 0.28)
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size)
    if (age < 0.36 && !f.reduced) {
      const k = age / 0.36, reach = geo.cell * 0.5 * easeOutCubic(k)
      ctx.globalAlpha = alpha * (1 - k)
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) ctx.fillRect(cx + dx * reach - 1, cy + dy * reach - 1, 2, 2)
    }
  }
  ctx.restore()
}

// ═════════════════════════════════════════════════════════════════════════
// 1.B — the Yeanling. Multiplies.
// ═════════════════════════════════════════════════════════════════════════

// A limb: where it stands, how wide, and the dots of its rim and its coat as (along, across, brightness).
type Leg = { fx: number; fy: number; top: number; ankle: number; bend: number; lands: number; dim: number; phase: number; dots: Float32Array; body?: { picture: HTMLCanvasElement; left: number } }

function grove(env: Env, encounter: Encounter): Moment {
  const { geo, small, reduced, short, w, h } = env
  const T = short
    ? { dim: 0.3, light: 0.3, divide: 0.85, cut: 1.5, land: 1.64, name: 1.7, bar: 1.76, out: 2.15, end: 2.5 }
    : { dim: 1.0, light: 1.0, divide: 2.8, cut: 5.8, land: 6.2, name: 6.3, bar: 6.6, out: 8.2, end: 8.8 }
  const look = SIGN_LOOKS.grove as SignLook
  const mask = signMask(encounter)
  const boss = bossOf(encounter)
  const cell = geo.cell
  const bx = geo.x + (boss.pos.x + 0.5) * cell, by = geo.y + (boss.pos.y + 0.5) * cell
  const rim = rgbOf('#9FCB6B'), birth = rgbOf('#E4FF9A')
  const text = bossText(1)

  // The sign lights outward from the god, accelerating.
  const litAt = new Float32Array(225).fill(Infinity)
  const order = [...encounter.walls].sort((a, b) => Math.hypot(a[0] - boss.pos.x, a[1] - boss.pos.y) - Math.hypot(b[0] - boss.pos.x, b[1] - boss.pos.y))
  const clicks: number[] = []
  {
    let at = T.light
    const even = (T.divide - T.light - 0.25) / Math.max(1, order.length)
    order.forEach(([x, y], i) => {
      litAt[y * 15 + x] = at
      clicks.push(at)
      at += short ? even : Math.max(28, 110 * 0.93 ** i) / 1000
    })
  }

  // The grid divides. Each division starts at the god's cell and travels outward, cutting every
  // interval of the one before in two; each starts sooner after the last and reaches less far,
  // so the mesh is finest where it began. By the fifth it cannot be counted.
  const span0 = T.cut - T.divide
  const divisions = [0, 0.3, 0.54, 0.73, 0.87].map((k, i) => {
    const at = T.divide + k * span0, reach = [6.2, 5.1, 4.1, 3.1, 2.3][i]
    return { at, reach, pace: (T.cut - at) * 0.82 / reach, slide: (short ? 0.09 : 0.25) * (1 - i * 0.13), steady: [0.44, 0.31, 0.21, 0.14, 0.09][i] }
  })
  const cellDist = new Float32Array(225)
  for (let i = 0; i < 225; i++) cellDist[i] = Math.hypot((i % 15) - boss.pos.x, Math.floor(i / 15) - boss.pos.y)

  // What stands on it. One limb comes down on the god's own cell; the rest are further off.
  const rnd = mulberry32(encounter.seed ^ 0x51ed)
  const legAt = (cx: number, cy: number, top: number, ankle: number, bend: number, lands: number, dim: number, count: number): Leg => {
    const dots = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const kind = rnd()
      if (kind < 0.62) {
        // the rim: light catches the edge of it
        dots[i * 3] = rnd() ** 0.75
        dots[i * 3 + 1] = (rnd() < 0.5 ? -1 : 1) * (1 - 0.1 * rnd() ** 2.2)
        dots[i * 3 + 2] = 0.55 + 0.45 * rnd()
      } else if (kind < 0.76) {
        // the hoof: its lower edge and the cleft between the two toes
        const cleft = rnd() < 0.45
        dots[i * 3] = cleft ? 0.925 + 0.075 * rnd() : 0.992 + 0.008 * rnd()
        dots[i * 3 + 1] = cleft ? (rnd() < 0.5 ? -1 : 1) * 0.001 : (rnd() * 2 - 1)
        dots[i * 3 + 2] = 0.5 + 0.5 * rnd()
      } else {
        // the coat: faint, hanging in streaks
        dots[i * 3] = rnd()
        dots[i * 3 + 1] = (Math.floor(rnd() * 9) - 4 + (rnd() - 0.5) * 0.3) / 5
        dots[i * 3 + 2] = 0.07 + 0.13 * rnd()
      }
    }
    return { fx: geo.x + (cx + 0.5) * cell, fy: geo.y + (cy + 0.5) * cell + ankle * cell * 0.3, top: top * cell, ankle: ankle * cell, bend: bend * cell, lands, dim, phase: rnd() * TAU, dots }
  }
  const legs: Leg[] = [
    legAt(13.9, 2.1, 0.9, 0.52, 0.12, T.land - 0.3, 0.42, small ? 90 : 170),
    legAt(0.9, 6.6, 1.25, 0.7, -0.18, T.land - 0.22, 0.55, small ? 120 : 230),
    legAt(13.5, 9.2, 1.5, 0.85, 0.22, T.land - 0.14, 0.66, small ? 140 : 280),
    legAt(2.3, 13.2, 1.7, 1.0, -0.25, T.land - 0.07, 0.75, small ? 160 : 320),
    legAt(boss.pos.x, boss.pos.y, small ? 4.4 : 4.1, small ? 2.4 : 2.25, 0.34, T.land, 1, small ? 1000 : 2400),
  ]
  // Where its middle runs and half its width at `v` (0 top of the frame, 1 the ground): a taper with one joint, then the hoof.
  const centre = (leg: Leg, v: number) => leg.fx + leg.bend * Math.sin(Math.PI * Math.min(1, v / 0.9)) * (1 - v * 0.3)
  const halfWidth = (leg: Leg, v: number) => {
    const shaft = lerp(leg.top, leg.ankle, smoother(clamp01(v / 0.8))) / 2
    return shaft * (1 + 0.42 * smoother(clamp01((v - 0.86) / 0.14)))
  }
  const cleftHalf = (leg: Leg, v: number) => (v <= 0.925 ? 0 : leg.ankle * 0.13 * (v - 0.925) / 0.075)

  // The name: copies of it all over the board that turn out to be one.
  const namePx = small ? 22 : 34, copyPx = small ? 6 : 7
  const nameY = geo.y + (small ? 10.9 : 10.3) * cell
  const nameX = geo.x + 7.5 * cell
  const copies = Array.from({ length: small ? 140 : 400 }, () => ({ x: geo.x + rnd() * 15 * cell, y: geo.y + rnd() * 15 * cell, late: rnd() * 0.3 }))
  const barY = nameY + (small ? 22 : 30), barW = (small ? 9 : 7) * cell, barH = small ? 4 : 5
  const counts = [1, 2, 4, 8, 16, 32, boss.robustness]
  const splitEvery = short ? 0.05 : 0.15
  let stamped: HTMLCanvasElement | null = null
  const nameStamp = (): HTMLCanvasElement => {
    if (stamped) return stamped
    const canvas = document.createElement('canvas')
    const picture = canvas.getContext('2d')
    const px = namePx * env.dpr
    canvas.height = Math.ceil(px * 1.4)
    if (picture) {
      picture.font = font(px, 700)
      canvas.width = Math.ceil(picture.measureText(text.name).width) + 4
      picture.font = font(px, 700)
      picture.fillStyle = WHITE
      picture.textBaseline = 'alphabetic'
      picture.fillText(text.name, 2, px * 1.05)
    }
    return (stamped = canvas)
  }

  function drawMesh(f: Frame, alpha: number): void {
    const { ctx, t } = f
    if (t <= T.divide || alpha <= 0.003) return
    ctx.save()
    // darker than the board, and greener: something finer is where the board was
    const first = divisions[0]
    for (let i = 0; i < 225; i++) {
      const since = t - first.at - cellDist[i] * first.pace
      if (since <= 0 || cellDist[i] > first.reach) continue
      ctx.globalAlpha = alpha * 0.92 * Math.min(1, since / 0.25)
      ctx.fillStyle = '#0B1208'
      ctx.fillRect(geo.x + (i % 15) * cell + 1, geo.y + Math.floor(i / 15) * cell + 1, cell - 1, cell - 1)
    }
    divisions.forEach((division, level) => {
      if (t <= division.at) return
      const per = 2 ** level, gap = cell / per             // the interval this division cuts in two
      const fine = gap / 2 < 1.7                           // too fine to be lines on this screen: it has become a surface
      const thick = gap / 2 < 4 ? 0.6 : 0.8
      const steady = `rgb(${rim[0]},${rim[1]},${rim[2]})`, born = `rgb(${birth[0]},${birth[1]},${birth[2]})`
      for (let i = 0; i < 225; i++) {
        const since = t - division.at - cellDist[i] * division.pace
        if (since <= 0 || cellDist[i] > division.reach) continue
        const x0 = geo.x + (i % 15) * cell, y0 = geo.y + Math.floor(i / 15) * cell
        const k = clamp01(since / division.slide)
        if (fine) {
          ctx.globalAlpha = alpha * division.steady * 0.6 * k
          ctx.fillStyle = steady
          ctx.fillRect(x0 + 1, y0 + 1, cell - 1, cell - 1)
          continue
        }
        // each new line leaves the old one it was part of; it is brighter at the instant of its birth,
        // a few cells at a time: a thin front crossing the mesh. (Hairlines as rectangles: strokes are slow.)
        const moved = reduced ? 1 : easeOutCubic(k)
        const fresh = since < 0.16 && !reduced
        ctx.globalAlpha = alpha * (fresh ? Math.min(0.95, division.steady * 2.6) : division.steady * (reduced ? k : 1))
        ctx.fillStyle = fresh ? born : steady
        for (let j = 0; j < per; j++) {
          const o = Math.round((j + 0.5 * moved) * gap)
          ctx.fillRect(x0 + o, y0 + 1, thick, cell - 1)
          ctx.fillRect(x0 + 1, y0 + o, cell - 1, thick)
        }
      }
    })
    ctx.restore()
  }

  function drawLegs(f: Frame, leaving: number): void {
    const { ctx, t } = f
    if (t < T.cut) return
    const standing: { leg: Leg; lift: number; show: number; sway: number; length: number }[] = []
    for (const leg of legs) {
      const fall = span(t, leg.lands - (T.land - T.cut), T.land - T.cut)
      if (fall <= 0) continue
      const length = leg.fy + 90
      // It comes down faster than it should: nothing that size slows for the ground.
      const lift = reduced ? 0 : (1 - fall * fall) * length + leaving * leaving * (length + 140)
      const show = reduced ? fall * (1 - leaving) : 1
      const sway = reduced ? 0 : Math.sin(TAU * 0.3 * t + leg.phase) * (small ? 2 : 3.5) * (leg.dim < 1 ? 0.7 : 1)
      standing.push({ leg, lift, show, sway, length })
      // Its dark body is one picture, made once (a path filled every frame beside the point buffer is slow);
      // the sway is a lean of that picture, greatest at the top of the frame.
      if (!leg.body) {
        const wide = Math.ceil(leg.top * 1.5 + Math.abs(leg.bend) * 2 + 16)
        const picture = document.createElement('canvas')
        picture.width = wide
        picture.height = Math.ceil(length)
        const left = leg.fx - wide / 2
        const pen = picture.getContext('2d')
        if (pen) {
          const at = (v: number, u: number): [number, number] => [centre(leg, v) + u - left, v * length]
          pen.fillStyle = '#020402'
          pen.beginPath()
          const steps = 30
          for (let s = 0; s <= steps; s++) { const v = s / steps, [x, y] = at(v, -halfWidth(leg, v)); if (s === 0) pen.moveTo(x, y); else pen.lineTo(x, y) }
          pen.lineTo(...at(1, -cleftHalf(leg, 1)))
          pen.lineTo(...at(0.925, 0))
          pen.lineTo(...at(1, cleftHalf(leg, 1)))
          for (let s = steps; s >= 0; s--) { const v = s / steps; pen.lineTo(...at(v, halfWidth(leg, v))) }
          pen.closePath()
          pen.fill()
        }
        leg.body = { picture, left }
      }
      ctx.save()
      ctx.globalAlpha = (0.8 + 0.17 * leg.dim) * show
      // x' = x + sway (1 - v), v = (y + 90 + lift) / length
      ctx.transform(1, 0, -sway / length, 1, sway * (1 - (90 + lift) / length), 0)
      ctx.drawImage(leg.body.picture, leg.body.left, -90 - lift)
      ctx.restore()
    }
    f.field.clear()
    for (const { leg, lift, show, sway, length } of standing) {
      const size = leg.dim < 1 ? (small ? 1.3 : 1.6) : (small ? 1.7 : 2.2)
      for (let i = 0; i < leg.dots.length; i += 3) {
        const v = leg.dots[i], u = leg.dots[i + 1]
        const y = -90 + v * length - lift
        if (y < -4 || y > h + 4) continue
        const half = halfWidth(leg, v), gap = cleftHalf(leg, v)
        // across the limb; in the hoof, either side of the cleft
        const across = Math.abs(u) < 0.01 ? Math.sign(u) * gap : Math.sign(u) * (gap + Math.abs(u) * (half - gap))
        const b = leg.dots[i + 2] * leg.dim * show
        // lit from below, where the sign is: brighter toward the ground
        dot(f, centre(leg, v) + across + sway * (1 - v), y, size, rim, b * (0.3 + 0.7 * v * v))
      }
    }
    // What the foot does to the ground: one ring of dust, once.
    const since = t - T.land
    if (since > 0 && since < 0.9 && !reduced) {
      const k = since / 0.9, r = cell * (1.2 + 3.4 * easeOutCubic(k))
      for (let i = 0; i < 170; i++) {
        const a = i * 2.39996 + 0.3, wob = 0.9 + 0.2 * Math.sin(i * 12.9898)
        dot(f, bx + Math.cos(a) * r * wob, by + cell * 0.4 + Math.sin(a) * r * wob * 0.8, 1.6, rim, 0.55 * (1 - k) ** 1.5)
      }
    }
    f.field.end(ctx, 1, 0.7)
  }

  function drawName(f: Frame, alpha: number): void {
    const { ctx, t } = f
    const k = span(t, T.name, short ? 0.25 : 0.6)
    if (k <= 0 || alpha <= 0.003) return
    ctx.save()
    // a card of plain dark for the name to stand on
    ctx.globalAlpha = alpha * 0.86 * clamp01((k - 0.5) * 2)
    ctx.fillStyle = '#040504'
    ctx.fillRect(nameX - barW / 2 - 34, nameY - namePx - 14, barW + 68, namePx + (small ? 70 : 84))
    if (k < 1) {
      // Hundreds of it, small, everywhere. Then they are one. (One picture of the word, drawn at each size.)
      const stamp = nameStamp()
      for (const copy of copies) {
        const own = clamp01((k - copy.late * 0.6) / (1 - copy.late * 0.6))
        const e = reduced ? 0 : easeInOutCubic(own)
        // each fades as it arrives, so the many do not pile into a block of white where the one will be
        ctx.globalAlpha = alpha * 0.2 * Math.min(1, k * 6) * (reduced ? 1 - k : (1 - own) ** 3)
        const px = lerp(copyPx, namePx, e * e), wide = stamp.width / stamp.height * px * 1.4
        ctx.drawImage(stamp, lerp(copy.x, nameX, e) - wide / 2, lerp(copy.y, nameY, e) - px * 1.05, wide, px * 1.4)
      }
    }
    const landed = reduced ? k : clamp01((k - 0.72) / 0.28)
    if (landed > 0) {
      ctx.globalAlpha = alpha * landed
      ctx.fillStyle = WHITE
      trackedText(ctx, text.name, nameX, nameY, namePx, lerp(1.2, 0.32, reduced ? 1 : easeOutCubic(landed)), 800)
    }
    // The bar divides until it is as many as it has Robustness.
    const sinceBar = t - T.bar
    if (sinceBar > 0) {
      const step = Math.min(counts.length - 1, Math.floor(sinceBar / splitEvery))
      const into = step >= counts.length - 1 ? 1 : clamp01((sinceBar - step * splitEvery) / (splitEvery * 0.8))
      const from = counts[step], to = step >= counts.length - 1 ? counts[step] : counts[step + 1]
      const e = reduced ? 1 : easeInOutCubic(into)
      const x0 = nameX - barW / 2
      ctx.globalAlpha = alpha * Math.min(1, sinceBar * 8)
      const bright = into < 1 && step < counts.length - 1 ? 1 - into : 0
      ctx.fillStyle = `rgb(${lerp(rim[0], birth[0], bright) | 0},${lerp(rim[1], birth[1], bright) | 0},${lerp(rim[2], birth[2], bright) | 0})`
      const gap = to > 20 ? 1 : 2
      for (let j = 0; j < to; j++) {
        const parent = Math.floor(j * from / to)
        const a = lerp(parent / from, j / to, e), b = lerp((parent + 1) / from, (j + 1) / to, e)
        ctx.fillRect(x0 + a * barW, barY, Math.max(1, (b - a) * barW - gap), barH)
      }
      ctx.font = font(small ? 9 : 11, 500)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = rgba('#9FCB6B', 0.9)
      ctx.fillText(String(into >= 0.5 ? to : from), x0 + barW + 8, barY + barH / 2 + 0.5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.globalAlpha = alpha * clamp01((sinceBar - 0.1) * 4) * 0.75
      trackedText(ctx, text.epithet, nameX, barY + barH + (small ? 16 : 20), small ? 9 : 11, 0.5, 500)
    }
    ctx.restore()
  }

  const cues: Cue[] = []
  // a click for each point of the sign, each a little higher: by the end they are a buzz
  cues.push({
    at: T.light,
    fire: (s, when) => clicks.forEach((at, i) => noiseTick(s.ctx, s.master.sfx, when + at - T.light, 1800 * 1.02 ** i, 0.045, 0.025, 4)),
  })
  cues.push({ at: clicks[clicks.length - 1] ?? T.divide, fire: (s, when, keep) => { keep(lowTone(s.ctx, both(s, 'music'), 49, when, 0.4, { gain: 0.22 }), 0.2).stop(when + (T.cut - (clicks[clicks.length - 1] ?? T.divide)), 0.05) } })
  // ticks that double until they are a pitch
  cues.push({ at: T.divide, fire: (s, when, keep) => { keep(pulseTrain(s.ctx, both(s), when, { from: short ? 8 : 1, to: 64, seconds: T.cut - T.divide, gain: 0.3 }), 0.1).stop(when + T.cut - T.divide, 0.04) } })
  // it stops dead; then one foot
  cues.push({ at: T.cut, fire: (s, when) => silence(s, when) })
  cues.push({ at: T.land - 0.06, fire: (s, when) => { restore(s, when, 0.01); footfall(s, when + 0.06) } })
  cues.push({ at: T.bar, fire: (s, when) => counts.slice(1).forEach((_, i) => blip(s.ctx, s.master.sfx, when + (i + 0.2) * splitEvery, 880 * 2 ** (-i / 6), 0.035, 0.09)) })

  return {
    length: T.end,
    entered: 1,
    cues,
    cover: t => Math.min(lerp(0, 0.9, span(t, 0, T.dim)) + 0.1 * span(t, T.cut - 0.3, 0.3), 1 - span(t, T.end - 0.32, 0.32)),
    draw(f) {
      const { ctx, t } = f
      const out = span(t, T.out, T.end - T.out - 0.3)
      const leaving = easeInOutCubic(out)
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)
      // the ground answers the foot
      const since = t - T.land
      const shake = since > 0 && since < 0.5 && !reduced ? 6 * Math.exp(-since / 0.13) * Math.cos(TAU * 17 * since) : 0
      ctx.save()
      ctx.translate(0, shake)
      drawBoard(ctx, geo, encounter, mask, { look: null, labels: lerp(0.35, 1, leaving) })
      drawMesh(f, 1 - leaving)
      const ripple = (i: number) => {
        // the same pulse the board will give when it strikes
        const reachAt = since - Math.hypot((i % 15) - boss.pos.x, Math.floor(i / 15) - boss.pos.y) * 0.055
        return reduced || reachAt <= 0 || reachAt >= 0.5 ? 0 : 0.7 * Math.sin(Math.PI * reachAt / 0.5) ** 2
      }
      drawBoard(ctx, geo, encounter, mask, {
        tiles: 0,
        light: i => lerp(burn(t - litAt[i]).light + ripple(i), 1, leaving),
        seen: i => (mask[i] === 2 ? burn(t - litAt[i]).seen : clamp01((t - T.divide + 0.4) * 2)),
      })
      ignitions(f, mask, litAt, look.hue)
      if (reduced && since > 0 && since < 0.2) {
        ctx.fillStyle = `rgba(0,0,0,${(0.15 * (1 - since / 0.2)).toFixed(3)})`
        ctx.fillRect(geo.x, geo.y, cell * 15, cell * 15)
      }
      ctx.restore()
      drawLegs(f, leaving)
      ctx.save()
      ctx.translate(0, shake)
      drawName(f, 1 - span(t, T.out, 0.3))
      ctx.restore()
    },
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 2.B — the Queen of the Red. Performs.
// ═════════════════════════════════════════════════════════════════════════

const BONE = '#F3EDE2', FIELD = '#C4162E'

type MaskDots = { count: number; x: Float32Array; y: Float32Array; size: Float32Array; shade: Float32Array; side: Int8Array }
export type MaskShape = {
  ex: number; ey: number; unit: number                     // the eye's centre and half-width, in pixels
  w: number; h: number
  halves: HTMLCanvasElement[]                              // its dots, drawn once: the part left of the crack, and the part right of it
  inEye(x: number, y: number, grow?: number): boolean
  eyePath(ctx: CanvasRenderingContext2D, scale?: number, fresh?: boolean): void   // `fresh` false adds the eye to the path already begun
  crack: [number, number][]                                // a polyline through it, top to bottom
}

// A bone mask too large for the frame, as a halftone of dots: an ellipsoid
// with a brow, a socket, the bridge of a nose and a cheekbone, lit from the
// upper left. Only the part around one eye is ever on screen. The eye is a
// hole.
export function buildMask(env: Env): MaskShape {
  const { geo, w, h, small } = env
  const ex = geo.x + 7.5 * geo.cell, ey = geo.y + 7.5 * geo.cell
  const unit = geo.cell * (small ? 7.1 : 6.6)
  const tilt = -0.09
  const ct = Math.cos(tilt), st = Math.sin(tilt)
  // The lids: the upper one arched, the lower one shallow; the inner corner (toward the nose, +x) a little low.
  const lidUp = (x: number) => 0.52 * Math.max(0, 1 - x * x) ** 0.72 - 0.05 * x * Math.max(0, 1 - x * x)
  const lidLow = (x: number) => 0.37 * Math.max(0, 1 - x * x) ** 0.86 + 0.05 * x * Math.max(0, 1 - x * x)
  const local = (px: number, py: number): [number, number] => {
    const dx = (px - ex) / unit, dy = (py - ey) / unit
    return [dx * ct + dy * st, -dx * st + dy * ct]
  }
  const inEye = (px: number, py: number, grow = 1) => {
    const [x, y] = local(px, py)
    return Math.abs(x) < grow && y > -lidUp(x / grow) * grow && y < lidLow(x / grow) * grow
  }
  const gauss = (d: number) => Math.exp(-d * d)
  const inside = (x: number, y: number) => ((x - 1.75) / 3.5) ** 2 + ((y - 0.35) / 4.7) ** 2 < 1
  // How much light each place on the mask sends back: painted, not computed. A brow over the eye and the
  // shadow under it, the lower lid, a cheekbone, the bridge of a nose toward +x, the temple turning away.
  const wide = (x: number) => Math.max(0, 1 - (x / 1.25) ** 2)
  const shadeAt = (x: number, y: number) => {
    const brow = -0.56 * wide(x) ** 0.7 - 0.42 + 0.04 * x          // the line of the brow ridge
    const d = y - brow
    let s = 0.62
    s += 0.4 * gauss(d / 0.15) * (0.35 + 0.65 * wide(x * 0.8))      // the ridge catches the light
    s += 0.2 * clamp01(-d / 1.1)                                     // the forehead above it
    s -= 0.66 * gauss((d - 0.3) / 0.16) * wide(x * 0.9) ** 0.5       // and the socket under it is in shadow
    const below = y - lidLow(Math.max(-1, Math.min(1, x)))
    s -= 0.26 * gauss((below - 0.13) / 0.1) * wide(x)                // the crease under the lower lid
    s += 0.4 * gauss(Math.hypot((x + 0.15) / 1.05, (y - 1.12) / 0.42)) // the cheekbone
    s -= 0.3 * clamp01((y - 1.55) / 1.3)                             // falling away toward the jaw
    const nose = y > -0.75 ? 1 : gauss((y + 0.75) / 0.35)
    s += 0.5 * gauss((x - 1.86) / 0.2) * nose                        // the bridge of the nose
    s -= 0.5 * gauss((x - 1.42) / 0.2) * nose * (0.4 + 0.6 * clamp01(1 - Math.abs(y) / 1.6)) // the hollow beside it
    s -= 0.4 * gauss((x - 2.3) / 0.22) * nose                        // its far side
    const fx = (x - 1.75) / 3.5, fy = (y - 0.35) / 4.7
    const edge = clamp01((1 - Math.sqrt(fx * fx + fy * fy)) * 7)     // the rim of the mask turns from the light
    return clamp01(s) ** 1.3 * (0.12 + 0.88 * edge)
  }

  const pitch = small ? 7.5 : 9.5
  const cols = Math.ceil(w * 1.06 / pitch) + 2, rows = Math.ceil(h * 1.06 / pitch) + 2
  const rnd = mulberry32(0xb0e)
  const max = cols * rows + 1400
  const dots: MaskDots = { count: 0, x: new Float32Array(max), y: new Float32Array(max), size: new Float32Array(max), shade: new Float32Array(max), side: new Int8Array(max) }
  // the crack it will one day show: nine segments from brow to jaw, through the eye
  const crack: [number, number][] = []
  for (let i = 0; i <= 9; i++) {
    const v = i / 9
    crack.push([ex + unit * (0.16 + (i % 2 ? 0.09 : -0.08) * (i > 0 && i < 9 ? 1 : 0) + 0.22 * Math.sin(v * 5.1 + 0.6) - 0.3 * (v - 0.5)), -h * 0.08 + v * h * 1.16])
  }
  const crackX = (py: number) => {
    for (let i = 0; i < crack.length - 1; i++) {
      if (py <= crack[i + 1][1]) return lerp(crack[i][0], crack[i + 1][0], clamp01((py - crack[i][1]) / (crack[i + 1][1] - crack[i][1])))
    }
    return crack[crack.length - 1][0]
  }
  const push = (px: number, py: number, size: number, shade: number, side = 0) => {
    const i = dots.count++
    dots.x[i] = px; dots.y[i] = py; dots.size[i] = size; dots.shade[i] = shade
    dots.side[i] = side || (px < crackX(py) ? -1 : 1)
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = -w * 0.03 + (c + (r % 2 ? 0.5 : 0) + (rnd() - 0.5) * 0.45) * pitch
      const py = -h * 0.03 + (r + (rnd() - 0.5) * 0.45) * pitch
      const [x, y] = local(px, py)
      if (!inside(x, y) || inEye(px, py, 1.03)) continue
      const s = shadeAt(x, y)
      if (s < 0.02) continue
      push(px, py, (small ? 0.85 : 1) * (0.7 + 4.1 * s), 0.14 + 0.86 * s)
    }
  }
  // the lids: a clean edge, so the hole is cut and not faded
  const lids = small ? 300 : 620
  for (let i = 0; i < lids; i++) {
    const x = -1 + 2 * (i + 0.5) / lids
    for (const side of [-1, 1]) {
      const y = (side < 0 ? -lidUp(x) : lidLow(x)) * 1.04 + side * 0.012 * rnd()
      push(ex + unit * (x * 1.03 * ct - y * st), ey + unit * (x * 1.03 * st + y * ct), side < 0 ? 2.3 : 1.7, side < 0 ? 1 : 0.62)
    }
  }
  const eyePath = (ctx: CanvasRenderingContext2D, scale = 1, fresh = true) => {
    if (fresh) ctx.beginPath()
    const n = 44
    for (let i = 0; i <= n; i++) {
      const x = -1 + 2 * i / n, y = -lidUp(x)
      const px = ex + unit * scale * (x * ct - y * st), py = ey + unit * scale * (x * st + y * ct)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    for (let i = n; i >= 0; i--) {
      const x = -1 + 2 * i / n, y = lidLow(x)
      ctx.lineTo(ex + unit * scale * (x * ct - y * st), ey + unit * scale * (x * st + y * ct))
    }
    ctx.closePath()
  }
  // Thirteen thousand dots that never change are drawn once, each half to its own picture, glow and all.
  const field = new PointField()
  field.resize(w, h, env.dpr)
  const bone = rgbOf(BONE)
  const halves = [-1, 1].map(side => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * field.scale))
    canvas.height = Math.max(1, Math.round(h * field.scale))
    const picture = canvas.getContext('2d')
    if (!picture) return canvas
    picture.setTransform(field.scale, 0, 0, field.scale, 0, 0)
    field.clear()
    for (let i = 0; i < dots.count; i++) {
      if (dots.side[i] === side) field.splat(dots.x[i] * field.scale, dots.y[i] * field.scale, dots.size[i] * field.scale, bone[0], bone[1], bone[2], dots.shade[i])
    }
    field.end(picture, 1, 0.55)
    return canvas
  })
  return { ex, ey, unit, w, h, halves, inEye, eyePath, crack }
}

/** The mask, added onto the frame. `scale` is the push-in about the eye; `part` moves each half away from the crack. */
export function drawMask(f: Frame, mask: MaskShape, alpha: number, scale = 1, part = 0): void {
  if (alpha <= 0.003) return
  const { ctx } = f
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = alpha
  ctx.imageSmoothingEnabled = true
  mask.halves.forEach((half, i) => {
    ctx.drawImage(half, mask.ex - mask.ex * scale + (i ? part : -part), mask.ey - mask.ey * scale, mask.w * scale, mask.h * scale)
  })
  ctx.restore()
}

// The board with the red on it: tiles and lines go black on the field, the sign stays bone.
function drawRedBoard(f: Frame, encounter: Encounter, mask: Uint8Array, red: (column: number) => number, signLight: (i: number) => { light: number; seen: number }, boneness: number, alpha = 1): void {
  const { ctx, geo } = f
  const cell = geo.cell
  const bone: SignLook = { hue: BONE, core: BONE, line: 0.6 }
  drawBoard(ctx, geo, encounter, mask, { look: null, labels: 0.35, alpha })
  ctx.save()
  ctx.globalAlpha = alpha
  // the field, in strips, so its edge can be soft
  const strips = 60
  for (let i = 0; i < strips; i++) {
    const a = red((i + 0.5) / strips * 15)
    if (a <= 0.003) continue
    ctx.fillStyle = rgba(FIELD, a)
    ctx.fillRect(geo.x + i * cell * 15 / strips, geo.y, cell * 15 / strips + 0.5, cell * 15)
  }
  ctx.lineWidth = 1
  for (let x = 0; x <= 15; x++) {
    const a = red(Math.min(14.99, Math.max(0.01, x)))
    if (a <= 0.003) continue
    ctx.strokeStyle = `rgba(0,0,0,${(0.6 * a).toFixed(3)})`
    ctx.beginPath()
    ctx.moveTo(geo.x + x * cell + 0.5, geo.y)
    ctx.lineTo(geo.x + x * cell + 0.5, geo.y + cell * 15)
    ctx.stroke()
  }
  for (let y = 0; y <= 15; y++) {
    for (let x = 0; x < 15; x++) {
      const a = red(x + 0.5)
      if (a <= 0.003) continue
      ctx.strokeStyle = `rgba(0,0,0,${(0.6 * a).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(geo.x + x * cell, geo.y + y * cell + 0.5)
      ctx.lineTo(geo.x + (x + 1) * cell, geo.y + y * cell + 0.5)
      ctx.stroke()
    }
  }
  ctx.restore()
  if (boneness > 0.003) drawBoard(ctx, geo, encounter, mask, { tiles: 0, look: bone, alpha: alpha * boneness, bare: true, light: i => signLight(i).light, seen: i => signLight(i).seen })
  if (boneness < 0.997) drawBoard(ctx, geo, encounter, mask, { tiles: 0, alpha: alpha * (1 - boneness), light: i => Math.min(1, signLight(i).light), seen: i => signLight(i).seen })
}

function court(env: Env, encounter: Encounter): Moment {
  const { geo, small, reduced, short, w, h } = env
  const T = short
    ? { dim: 0.3, light: 0.3, curtain: 0.7, wrong: 1.15, black: 1.3, mask: 1.5, name: 1.7, strike: 1.7, real: 1.75, bar: 1.8, hold: 2.0, out: 2.1, end: 2.5 }
    : { dim: 0.8, light: 0.8, curtain: 2.6, wrong: 4.2, black: 4.4, mask: 5.2, name: 7.0, strike: 7.2, real: 7.42, bar: 7.36, hold: 7.9, out: 8.4, end: 9.0 }
  const mask = signMask(encounter)
  const boss = bossOf(encounter)
  const cell = geo.cell
  const text = bossText(2)
  const wrongName = (bossOf(WARDEN_ENCOUNTER).name ?? '').split(' / ')[0]

  // Laid like a checker: alternate points first, then the rest.
  const litAt = new Float32Array(225).fill(Infinity)
  const clicks: number[] = []
  {
    const walls = [...encounter.walls].sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const order = [...walls.filter((_, i) => i % 2 === 0), ...walls.filter((_, i) => i % 2 === 1)]
    const each = (T.curtain - T.light - (short ? 0.05 : 0.3)) / Math.max(1, order.length)
    order.forEach(([x, y], i) => { litAt[y * 15 + x] = T.light + i * each; clicks.push(T.light + i * each) })
  }

  const namePx = small ? 19 : 30
  const shape = buildMask(env)
  const nameY = Math.min(h - (small ? 70 : 90), shape.ey + shape.unit * 0.47 + (small ? 3.2 : 2.6) * cell)
  const nameX = shape.ex
  const nameW = Math.min(w - 24, namePx * 0.62 * 1.34 * text.name.length + 60)
  const barY = nameY + (small ? 16 : 22), barW = Math.min(nameW - 40, (small ? 9 : 7) * cell)
  // The red board is the same picture for seconds at a time: it is drawn once and kept until it changes.
  const edge = 26
  const plate = document.createElement('canvas')
  plate.width = Math.round((cell * 15 + edge * 2) * env.dpr)
  plate.height = plate.width
  const plateCtx = plate.getContext('2d')
  let plateKey = ''

  const cues: Cue[] = []
  // two pitches a tritone apart, in turn: manners
  cues.push({ at: T.light, fire: (s, when) => clicks.forEach((at, i) => noiseTick(s.ctx, s.master.sfx, when + at - T.light, i % 2 ? 2121 : 1500, 0.045, 0.03, 5)) })
  const fanfare = T.wrong - (T.curtain + (short ? 0 : 0.2))
  cues.push({ at: T.wrong - fanfare, fire: (s, when) => { courtFanfare(s, when, fanfare, 2.4) } })
  cues.push({ at: T.black, fire: (s, when) => silence(s, when) })
  cues.push({
    at: T.mask - 0.05,
    fire: (s, when, keep) => {
      restore(s, when, 0.02)
      // one held note, one voice, no vibrato
      keep(vowel(s.ctx, both(s, 'music'), 146.83, when + 0.05, { gain: 0.2, attack: 0.5, vibrato: 0 }), 1.6)
    },
  })
  // a throat being cleared
  cues.push({ at: T.strike, fire: (s, when) => { brass(s.ctx, s.master.sfx, when, 196, 0.07, 0.06); brass(s.ctx, s.master.sfx, when + 0.11, 185, 0.1, 0.06) } })

  return {
    length: T.end,
    entered: 2,
    cues,
    cover: t => Math.min(lerp(0, 0.9, span(t, 0, T.dim)) + 0.1 * span(t, T.curtain, 0.5), 1 - span(t, T.end - 0.32, 0.32)),
    draw(f) {
      const { ctx, t } = f
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, w, h)
      const light = (i: number) => burn(t - litAt[i])
      const out = span(t, T.out, T.end - T.out - 0.3)
      // The red comes in from both sides as a curtain, once; and leaves once, at the very end.
      const drawn = span(t, T.curtain, T.wrong - T.curtain)
      const drained = easeInOutCubic(out)
      const red = (column: number) => {
        const fromEdge = Math.min(column, 15 - column) / 7.5
        const arriving = reduced ? drawn : clamp01((drawn * 1.3 - fromEdge) / 0.27)
        return 0.92 * smoother(arriving) * (1 - drained)
      }
      const boneness = 1 - drained

      if (t < T.black) {
        drawRedBoard(f, encounter, mask, red, light, 1)
        ignitions(f, mask, litAt, BONE)
        return
      }
      if (t < T.mask) {
        // Black. Everything.
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, w, h)
        return
      }
      // The mask: larger than the frame. The board is where it was, seen through the eye and nowhere else.
      const arrived = span(t, T.mask, short ? 0.2 : 0.4)
      const opened = easeInOutCubic(span(t, T.hold, T.out - T.hold))       // the dark round the eye gives the board back
      const push = reduced ? 1 : 1 + 0.006 * (t - T.mask)
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      const key = `${drained.toFixed(3)}|${cell}`
      if (plateCtx && key !== plateKey) {
        plateKey = key
        plateCtx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0)
        plateCtx.clearRect(0, 0, cell * 15 + edge * 2, cell * 15 + edge * 2)
        drawRedBoard({ ...f, ctx: plateCtx, geo: { x: edge, y: edge, cell } }, encounter, mask, red, light, boneness)
      }
      ctx.globalAlpha = arrived
      ctx.drawImage(plate, geo.x - edge, geo.y - edge, cell * 15 + edge * 2, cell * 15 + edge * 2)
      ctx.globalAlpha = 1
      // everything but the eye is dark, until the dark gives the board back
      if (opened < 1) {
        ctx.beginPath()
        ctx.rect(0, 0, w, h)
        shape.eyePath(ctx, push, false)
        ctx.fillStyle = `rgba(0,0,0,${(1 - opened).toFixed(3)})`
        ctx.fill('evenodd')
      }
      const named = span(t, T.name, 0.2)
      drawMask(f, shape, arrived * lerp(1, 0.2, opened) * (1 - span(t, T.out, (T.end - T.out) * 0.6)), push)

      // The name: the wrong one first, corrected without apology.
      const fade = 1 - span(t, T.hold, short ? 0.1 : 0.35)
      if (named > 0 && fade > 0) {
        ctx.save()
        // a card of plain dark on the cheek for the name to stand on
        ctx.fillStyle = `rgba(0,0,0,${(0.9 * named * fade).toFixed(3)})`
        ctx.fillRect(nameX - nameW / 2, nameY - namePx - 16, nameW, namePx + (small ? 62 : 74))
        const real = span(t, T.real, 0.12)
        if (real < 1 && !short) {
          ctx.globalAlpha = named * (1 - real) * fade
          ctx.fillStyle = BONE
          const width = trackedText(ctx, wrongName, nameX, nameY, namePx, 0.32, 800)
          const struck = reduced ? (t >= T.strike ? 1 : 0) : span(t, T.strike, 0.15)
          if (struck > 0) ctx.fillRect(nameX - width / 2 - 6, Math.round(nameY - namePx * 0.36), (width + 12) * struck, 1)
        }
        const shown = short ? named : real
        if (shown > 0) {
          ctx.globalAlpha = shown * fade
          ctx.fillStyle = BONE
          trackedText(ctx, text.name, nameX, nameY, namePx, 0.32, 800)
          ctx.globalAlpha = shown * fade * 0.62
          trackedText(ctx, text.epithet, nameX, barY + (small ? 20 : 24), small ? 9 : 11, 0.5, 600)
        }
        // The bar bows: drawn from the wrong end, taken back, drawn again.
        const b = t - T.bar
        if (b > 0) {
          const unit = short ? 0.05 : 0.18
          const k1 = clamp01(b / unit), k2 = clamp01((b - unit * 1.6) / (unit * 0.8)), k3 = clamp01((b - unit * 2.5) / unit)
          const e = (k: number) => (reduced ? stepped(k) : easeInOutCubic(k))
          ctx.globalAlpha = fade
          ctx.fillStyle = BONE
          const x0 = nameX - barW / 2
          if (k3 <= 0) {
            const len = barW * e(k1) * (1 - e(k2))
            ctx.fillRect(x0 + barW - len, barY, len, 3)
          } else {
            ctx.fillRect(x0, barY, barW * e(k3), 3)
            ctx.globalAlpha = fade * k3
            ctx.font = font(small ? 9 : 11, 500)
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(boss.robustness), x0 + barW + 8, barY + 2)
          }
        }
        ctx.restore()
      }
    },
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 3.B — no name. Withholds.
// ═════════════════════════════════════════════════════════════════════════

const AMBER = '#FFC857', PALLID = '#FFF3C4'

// A different part of the sign every 0.7 s, never the whole: a hash, so it is the same on every viewing.
const lots = (i: number, n: number) => {
  let a = (i * 374761393 + n * 668265263) >>> 0
  a = Math.imul(a ^ (a >>> 13), 1274126177) >>> 0
  return ((a ^ (a >>> 16)) >>> 0) / 4294967296
}

function carcosa(env: Env, encounter: Encounter): Moment {
  const { geo, small, reduced, short, w, h } = env
  const T = short
    ? { dim: 0.4, tries: 0.4, name: 1.2, spread: 1.45, bar: 1.75, tremble: 2.0, out: 2.6, end: 3.0, every: 0.35 }
    : { dim: 1.2, tries: 1.2, name: 4.2, spread: 5.2, bar: 6.4, tremble: 8.2, out: 10.2, end: 11.0, every: 0.7 }
  const mask = signMask(encounter)
  const boss = bossOf(encounter)
  const cell = geo.cell
  const cx = geo.x + (boss.pos.x + 0.5) * cell, cy = geo.y + (boss.pos.y + 0.5) * cell
  const god = (script.layers[3] as { god: { shown: string; glitch: string[] } }).god
  const amber = rgbOf(AMBER), pallid = rgbOf(PALLID)
  const start = encounter.playerStart

  // What a tokenizer shows for a thing it cannot say: boxes, then the strings it falls back on.
  const boxes = [...god.shown].length
  const unk = god.glitch[0] ?? '[UNK]', eot = god.glitch[1] ?? '', nan = god.glitch[3] ?? 'NaN'
  const boxW = small ? 17 : 28, boxH = small ? 22 : 36, boxGap = small ? 5 : 8
  const rowY = geo.y + (boss.pos.y + 1.55) * cell
  const rowX = geo.x + 7.5 * cell
  const namePx = small ? 13 : 20
  const barW = (small ? 8 : 6) * cell, barH = small ? 7 : 10
  const barX = rowX - barW / 2, barY = rowY + boxH + (small ? 30 : 44)

  // The player's own amber: where the first skill of the deck reaches from where they stand,
  // and the last amber words and numbers the board showed them (or, on a first visit, the deck's own).
  const state = battleStore.getSnapshot()
  const step = state.presets[0]?.steps[0]
  const reachCells: [number, number][] = []
  if (step) {
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      if (!mask[y * 15 + x] && !(x === boss.pos.x && y === boss.pos.y) && inAttackRange(start, { x, y }, step)) reachCells.push([x, y])
    }
  }
  const remembered = amberMemory().slice(-10).map(mark => ({ x: mark.x, y: mark.y, text: mark.text }))
  const marks = remembered.length >= 4 ? remembered : (() => {
    const rnd = mulberry32(encounter.seed ^ 0xa3be)
    const steps = state.presets.flatMap(preset => preset.steps).filter(s => s.amount > 0)
    const words = [...steps.slice(0, 5).map(s => `−${s.amount}`), ...steps.slice(0, 2).map(s => s.name.toUpperCase())]
    return words.map((text, i) => {
      const [x, y] = reachCells.length ? reachCells[Math.floor(rnd() * reachCells.length)] : [3 + (i * 4) % 9, 9 + (i * 3) % 5]
      return { x: x + 0.5, y: y + 0.5 - (i % 2) * 0.3, text }
    })
  })()

  const gazeDark = (f: Frame, i: number) => {
    const gx = f.pointer ? (f.pointer.x - geo.x) / cell : start.x + 0.5, gy = f.pointer ? (f.pointer.y - geo.y) / cell : start.y + 0.5
    const d = Math.hypot((i % 15) + 0.5 - gx, Math.floor(i / 15) + 0.5 - gy)
    return d <= 2 ? 1 : d >= 3.2 ? 0 : (3.2 - d) / 1.2
  }

  const cues: Cue[] = []
  // Everything stops, and stays stopped. Then a cluster that has no chord in it rises under the name that is not one.
  cues.push({ at: 0.02, fire: (s, when) => silence(s, when) })
  cues.push({
    at: T.name - 0.1,
    fire: (s, when, keep) => {
      restore(s, when, 0.05)
      keep(driftCluster(s.ctx, both(s, 'music'), when + 0.1, { gain: 0.28, rise: short ? 1.4 : 7 }), 4)
    },
  })

  return {
    length: T.end,
    entered: 3,
    cues,
    cover: t => Math.min(span(t, 0, T.dim), 1 - span(t, T.end - 0.4, 0.4)),
    draw(f) {
      const { ctx, t } = f
      const out = easeInOutCubic(span(t, T.out, T.end - T.out - 0.4))
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
      // Only the lines of the grid are left, and where the player stands. The tiles come back at the end.
      drawBoard(ctx, geo, encounter, mask, { look: null, alpha: out, labels: 1 })
      ctx.save()
      ctx.globalAlpha = (1 - out) * 0.75
      ctx.strokeStyle = BOARD_COLORS.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i <= 15; i++) {
        ctx.moveTo(geo.x + i * cell + 0.5, geo.y); ctx.lineTo(geo.x + i * cell + 0.5, geo.y + 15 * cell)
        ctx.moveTo(geo.x, geo.y + i * cell + 0.5); ctx.lineTo(geo.x + 15 * cell, geo.y + i * cell + 0.5)
      }
      ctx.stroke()
      ctx.restore()

      // The sign tries to light and never finishes: a little over half of it at a time,
      // and nothing at all where the player is looking.
      const trying = span(t, T.tries, 0.5)
      const n = Math.floor((t - T.tries) / T.every), phase = (t - T.tries) / T.every - n
      const blend = smoother(clamp01((phase - 0.43) / 0.57))
      const partial = (i: number) => lerp(lots(i, n) < 0.575 ? 1 : 0, lots(i, n + 1) < 0.575 ? 1 : 0, blend)
      const paling = span(t, T.tremble + (short ? 0.1 : 0.7), short ? 0.3 : 0.9)
      drawBoard(ctx, geo, encounter, mask, {
        tiles: 0, bare: true,
        look: { hue: AMBER, core: PALLID, line: 0.46 },
        light: () => lerp(1.7, 1, out),
        seen: i => trying * lerp(partial(i), 1, out) * (1 - gazeDark(f, i)),
      })
      // the tiles' own outlines for the walls come back with the tiles
      if (out > 0) drawBoard(ctx, geo, encounter, mask, { tiles: 0, alpha: out, light: () => 0, seen: () => 0 })

      // Where the player stands.
      ctx.save()
      const px = geo.x + (start.x + 0.5) * cell, py = geo.y + (start.y + 0.5) * cell
      ctx.fillStyle = BOARD_COLORS.blue
      ctx.globalAlpha = 0.85
      ctx.beginPath(); ctx.arc(px, py, cell * 0.11, 0, TAU); ctx.fill()
      ctx.globalAlpha = 0.2
      ctx.beginPath(); ctx.arc(px, py, cell * 0.21, 0, TAU); ctx.fill()
      ctx.restore()

      // The bar: an outline, and no fill. The fill is everything else.
      const outline = span(t, T.bar, short ? 0.2 : 0.7)
      const wash = 0.08 * span(t, T.bar + (short ? 0.05 : 0.5), short ? 0.2 : 1.1) * (1 - out)
      const hollow = span(t, T.tremble, short ? 0.2 : 0.7) * (1 - out)
      if (wash > 0.001) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, w, h)
        ctx.rect(barX, barY, barW, barH)
        ctx.fillStyle = rgba(AMBER, wash)
        ctx.fill('evenodd')
        // and the one cell where it stands: nothing is drawn there, not even its colour
        ctx.fillStyle = `rgba(0,0,0,${hollow.toFixed(3)})`
        ctx.fillRect(geo.x + boss.pos.x * cell + 1, geo.y + boss.pos.y * cell + 1, cell - 1, cell - 1)
        ctx.restore()
      }
      if (outline > 0) {
        ctx.save()
        ctx.globalAlpha = 1 - out
        ctx.strokeStyle = AMBER
        ctx.lineWidth = 1
        const e = reduced ? stepped(outline) : easeInOutCubic(outline)
        const peri = 2 * (barW + barH)
        ctx.setLineDash([peri * e, peri])
        ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1)
        ctx.setLineDash([])
        ctx.globalAlpha = (1 - out) * clamp01((outline - 0.6) / 0.4) * 0.85
        ctx.fillStyle = PALLID
        ctx.font = font(small ? 9 : 11, 500)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(boss.robustness), barX + barW + 8, barY + barH / 2 + 0.5)
        ctx.restore()
      }

      // The name: boxes; what the boxes fall back to; then the spaces between the letters grow until none is left on screen.
      const naming = t - T.name
      if (naming > 0 && t < T.bar + 0.2) {
        ctx.save()
        const unit = (T.spread - T.name) / 5
        const spread = span(t, T.spread, T.bar - T.spread)
        const total = boxes * boxW + (boxes - 1) * boxGap
        ctx.strokeStyle = PALLID
        ctx.fillStyle = PALLID
        ctx.lineWidth = 1
        if (naming < unit * 3) {
          for (let i = 0; i < boxes; i++) {
            const a = clamp01((naming - i * unit * 0.22) / (unit * 0.3)) * (1 - clamp01((naming - unit * 2.4) / (unit * 0.5)))
            if (a <= 0) continue
            const x = rowX - total / 2 + i * (boxW + boxGap)
            ctx.globalAlpha = a * 0.85
            ctx.strokeRect(Math.round(x) + 0.5, Math.round(rowY) + 0.5, boxW, boxH)
          }
        }
        const word = naming < unit * 2.6 ? '' : naming < unit * 4 ? unk.repeat(3) : eot
        if (word) {
          const tracking = reduced ? 0.4 : 0.4 + 60 * spread ** 2.2
          ctx.globalAlpha = reduced ? 1 - spread : 1 - clamp01((spread - 0.55) / 0.4)
          trackedText(ctx, word, rowX, rowY + boxH * 0.5 + namePx * 0.36, namePx, tracking, 600)
        }
        // under each, where the opening showed how much it attended: not a number
        const slots = clamp01((naming - unit * 1.2) / (unit * 0.6)) * (1 - spread)
        if (slots > 0) {
          ctx.globalAlpha = slots * 0.7
          ctx.font = font(small ? 7 : 9, 400)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          for (let i = 0; i < boxes; i++) {
            const x = rowX - total / 2 + i * (boxW + boxGap)
            const y = rowY + boxH + 6, hh = small ? 5 : 7
            ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, boxW, hh)
            ctx.beginPath()
            for (let k = -hh; k < boxW; k += 4) {
              ctx.moveTo(Math.max(x, x + k) + 0.5, y + (k < 0 ? -k : 0) + 0.5)
              ctx.lineTo(Math.min(x + boxW, x + k + hh) + 0.5, y + Math.min(hh, boxW - k) + 0.5)
            }
            ctx.stroke()
            if (!small || i % 2 === 0) ctx.fillText(nan, x + boxW / 2, y + hh + 4)
          }
        }
        ctx.restore()
      }

      // The tremble: the player's own amber comes back, pales to its colour, and leans toward the cell where nothing is.
      const back = span(t, T.tremble, short ? 0.15 : 0.5) * (1 - out)
      if (back > 0) {
        const lean = reduced ? 0 : easeInOutCubic(span(t, T.tremble + (short ? 0.1 : 0.6), short ? 0.4 : 1.4)) * 0.26
        const c = [lerp(amber[0], pallid[0], paling), lerp(amber[1], pallid[1], paling), lerp(amber[2], pallid[2], paling)]
        const colour = (a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`
        ctx.save()
        const toward = (gx: number, gy: number): [number, number] => {
          const x = geo.x + gx * cell, y = geo.y + gy * cell
          const d = Math.hypot(cx - x, cy - y) || 1
          return [x + (cx - x) / d * lean * cell, y + (cy - y) / d * lean * cell]
        }
        for (const [gx, gy] of reachCells) {
          const [x, y] = toward(gx, gy)
          ctx.fillStyle = colour(0.13 * back)
          ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
          ctx.strokeStyle = colour(0.34 * back)
          ctx.lineWidth = 0.8
          ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5)
        }
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        marks.forEach((mark, i) => {
          const [x, y] = toward(mark.x, mark.y)
          const number = mark.text.startsWith('−')
          ctx.font = number ? `800 ${Math.round(cell * (small ? 0.5 : 0.42))}px "JetBrains Mono", monospace` : `700 ${Math.max(8, Math.round(cell * 0.2))}px "JetBrains Mono", monospace`
          ctx.fillStyle = colour(back * clamp01((span(t, T.tremble, 0.6) * (marks.length + 2) - i) / 2) * (number ? 0.95 : 0.8))
          ctx.fillText(mark.text, x, y)
        })
        ctx.restore()
      }
    },
  }
}

export function entranceFor(encounter: Encounter): ((env: Env) => Moment) | null {
  if (encounter.kind !== 'boss') return null
  if (encounter.god === 'grove') return env => grove(env, encounter)
  if (encounter.god === 'court') return env => court(env, encounter)
  if (encounter.god === 'carcosa') return env => carcosa(env, encounter)
  return null
}
