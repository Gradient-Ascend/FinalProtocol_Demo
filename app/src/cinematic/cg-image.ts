// The first picture the AI is shown in the opening sequence: a human hand
// pressed against glass, seen from inside. It is drawn by this function and by
// nothing else: the bake (app/scripts/bake) feeds these pixels to the vision
// model, and the sequence draws these same pixels as dots.
//
// No imports and only erasable TypeScript: node runs this file directly when
// baking (see app/scripts/bake/render-inputs.mjs).

export const CG_IMAGE_SIZE = 224

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => {
  const k = clamp01((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}
// Smooth minimum: joins two shapes with a fillet of width k (the webbing).
const smin = (a: number, b: number, k: number) => {
  const h = clamp01(0.5 + 0.5 * (b - a) / k)
  return b + (a - b) * h - k * h * (1 - h)
}
const gauss = (dx: number, dy: number, s: number) => Math.exp(-(dx * dx + dy * dy) / (2 * s * s))

// Signed distance to a capsule whose radius tapers from ra at a to rb at b.
function capsule(px: number, py: number, ax: number, ay: number, bx: number, by: number, ra: number, rb: number): number {
  const dx = bx - ax, dy = by - ay
  const h = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  return Math.hypot(px - ax - dx * h, py - ay - dy * h) - (ra + (rb - ra) * h)
}

function roundBox(px: number, py: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(px - cx) - hx + r, qy = Math.abs(py - cy) - hy + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

function ellipse(px: number, py: number, cx: number, cy: number, rx: number, ry: number): number {
  // Not an exact distance, but close enough for a soft, out-of-focus shadow.
  const k = Math.hypot((px - cx) / rx, (py - cy) / ry)
  return (k - 1) * Math.min(rx, ry)
}

type Finger = { ax: number; ay: number; bx: number; by: number; ra: number; rb: number }

// Unit square, y down. The fingers are spread so that each one owns its own
// column of 16-pixel patches near the tip: the hand must survive being cut
// into 14 by 14 pieces.
const FINGERS: Finger[] = [
  { ax: 0.385, ay: 0.545, bx: 0.318, by: 0.262, ra: 0.041, rb: 0.033 },   // index
  { ax: 0.468, ay: 0.530, bx: 0.452, by: 0.205, ra: 0.042, rb: 0.034 },   // middle
  { ax: 0.550, ay: 0.535, bx: 0.592, by: 0.240, ra: 0.040, rb: 0.032 },   // ring
  { ax: 0.624, ay: 0.565, bx: 0.712, by: 0.352, ra: 0.036, rb: 0.028 },   // little
  { ax: 0.372, ay: 0.705, bx: 0.168, by: 0.560, ra: 0.050, rb: 0.037 },   // thumb
]

function handDistance(x: number, y: number): number {
  let d = roundBox(x, y, 0.505, 0.665, 0.150, 0.135, 0.085)                // palm
  d = smin(d, capsule(x, y, 0.42, 0.70, 0.36, 0.70, 0.085, 0.07), 0.05)    // ball of the thumb
  for (const f of FINGERS) d = smin(d, capsule(x, y, f.ax, f.ay, f.bx, f.by, f.ra, f.rb), 0.035)
  d = smin(d, capsule(x, y, 0.515, 0.80, 0.56, 1.12, 0.098, 0.105), 0.06)  // wrist, leaving the frame
  return d
}

function shadowDistance(x: number, y: number): number {
  const head = ellipse(x, y, 0.585, 0.255, 0.150, 0.185)
  const neck = roundBox(x, y, 0.585, 0.47, 0.062, 0.09, 0.03)
  const shoulders = ellipse(x, y, 0.585, 0.93, 0.47, 0.40)
  return smin(smin(head, neck, 0.05), shoulders, 0.08)
}

let cached: Float32Array | null = null

/** The picture, row-major, values 0..1 (0 = black). The default picture is drawn once and kept; do not write to it. */
export function renderHand(size: number = CG_IMAGE_SIZE, seed = 196): Float32Array {
  const standard = size === CG_IMAGE_SIZE && seed === 196
  if (standard && cached) return cached
  const out = new Float32Array(size * size)
  const rnd = mulberry32(seed)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size, y = (j + 0.5) / size

      // Behind the glass: a lit room, falling off toward the corners, and the
      // out-of-focus shadow of whoever the hand belongs to.
      let v = 0.045 + 0.20 * gauss(x - 0.52, y - 0.30, 0.42)
      v *= 1 - 0.80 * smooth(0.045, -0.035, shadowDistance(x, y))

      const d = handDistance(x, y)
      if (d < 0.014) {
        // Skin pressed on glass is brightest where it touches: the pads of the
        // fingers and the mounds of the palm. The hollow of the palm does not touch.
        let pads = 0
        for (const f of FINGERS) {
          const ux = f.bx - f.ax, uy = f.by - f.ay
          for (const [at, s, g] of [[0.93, 0.030, 1], [0.60, 0.028, 0.55], [0.28, 0.028, 0.45]] as const) {
            pads += g * gauss(x - (f.ax + ux * at), y - (f.ay + uy * at), s)
          }
        }
        pads += 0.75 * gauss(x - 0.405, y - 0.715, 0.062)                  // ball of the thumb
        pads += 0.60 * gauss(x - 0.612, y - 0.700, 0.055)                  // heel, little-finger side
        pads += 0.50 * gauss((x - 0.505) * 0.55, y - 0.572, 0.030)         // the row under the fingers
        const hollow = gauss(x - 0.515, y - 0.668, 0.050)

        // Creases: two across each finger, two across the palm.
        let crease = 0
        for (const f of FINGERS) {
          const ux = f.bx - f.ax, uy = f.by - f.ay, len = Math.hypot(ux, uy)
          const along = ((x - f.ax) * ux + (y - f.ay) * uy) / (len * len)
          const across = Math.abs((x - f.ax) * uy - (y - f.ay) * ux) / len
          const on = smooth(f.ra * 1.05, f.ra * 0.7, across)               // only on this finger
          for (const at of [0.42, 0.76]) crease = Math.max(crease, on * smooth(0.022, 0.004, Math.abs(along - at)))
        }
        const lifeLine = Math.abs(Math.hypot(x - 0.36, y - 0.74) - 0.135)
        const headLine = Math.abs(y - (0.625 + 0.10 * (x - 0.50) + 0.5 * (x - 0.5) * (x - 0.5)))
        crease = Math.max(crease, 0.8 * smooth(0.009, 0.002, lifeLine) * smooth(0.40, 0.46, x) * smooth(0.80, 0.72, y))
        crease = Math.max(crease, 0.7 * smooth(0.008, 0.002, headLine) * smooth(0.40, 0.45, x) * smooth(0.64, 0.60, x))

        let skin = 0.50 + 0.40 * clamp01(pads) - 0.16 * hollow - 0.20 * crease
        skin *= 0.52 + 0.48 * smooth(0, 0.036, -d)                         // the edge curves away from the glass
        skin *= 1 - 0.85 * smooth(0.80, 1.02, y)                           // the arm recedes into the room
        skin *= 0.86 + 0.14 * gauss(x - 0.46, y - 0.48, 0.40)              // the screen's own light
        v += (skin - v) * smooth(0.014, -0.006, d)
      }

      v += (rnd() - 0.5) * 0.035                                           // grain
      out[j * size + i] = clamp01(v)
    }
  }
  if (standard) cached = out
  return out
}
