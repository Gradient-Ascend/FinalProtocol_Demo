// A point renderer for representation space: Canvas 2D only. Points are
// projected by hand, added into an ImageData buffer (cheap at tens of
// thousands of points, where fillRect per point is not), and shown with an
// additive glow from a quarter-resolution blurred copy, the same recipe the
// battle effects use.
//
// It is an immediate-mode tool: each frame, begin(), add() every point,
// end(). What the points are and how they move is the caller's business.

export type Camera = {
  yaw: number            // radians about the vertical axis
  pitch: number          // radians above the horizon; PI/2 looks straight down
  distance: number       // from the eye to the target
  tx: number; ty: number; tz: number
  focal: number          // focal length as a multiple of min(width, height)
  cx?: number            // where the target sits on screen, 0..1 (default 0.5, 0.5)
  cy?: number
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Two circular wave sources with different wavelengths, plus a slow swell.
 * Their interference never quite repeats; one source alone reads as a pond.
 * This is a formula, not a projection of any data.
 */
export function wave(x: number, z: number, t: number): number {
  // Math.sqrt, not Math.hypot: this runs for every point of every frame
  const ax = x + 1.6, az = z + 0.8, bx = x - 2.1, bz = z - 1.2
  const r1 = Math.sqrt(ax * ax + az * az), r2 = Math.sqrt(bx * bx + bz * bz)
  return 0.55 * Math.sin(2.4 * r1 - 1.7 * t) / (1 + 0.35 * r1)
       + 0.40 * Math.sin(3.1 * r2 - 1.7 * t) / (1 + 0.35 * r2)
       + 0.12 * Math.sin(0.8 * x + 1.9 * z + 1.1 * t)
}

/**
 * n by n points over [-half, half] squared as x, z pairs. Each is jittered
 * once: a regular grid under perspective shimmers in moire bands.
 */
export function jitteredGrid(n: number, half: number, jitter = 0.35, rnd: () => number = Math.random): Float32Array {
  const out = new Float32Array(n * n * 2), cell = 2 * half / n
  for (let i = 0; i < n * n; i++) {
    out[i * 2] = -half + (i % n + 0.5 + (rnd() * 2 - 1) * jitter) * cell
    out[i * 2 + 1] = -half + (Math.floor(i / n) + 0.5 + (rnd() * 2 - 1) * jitter) * cell
  }
  return out
}

/** How many points a screen can afford: n for an n by n sheet. */
export function sheetSide(cssWidth: number, cssHeight: number): number {
  const short = Math.min(cssWidth, cssHeight)
  return short < 600 ? 80 : short < 820 ? 120 : 140                   // 6,400 on small screens, 14,400 or 19,600 on a desk
}

export class PointField {
  /** The sharp layer, in buffer pixels. end() draws it for you. */
  readonly canvas: HTMLCanvasElement
  private readonly glow: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly glowCtx: CanvasRenderingContext2D | null
  private image: ImageData | null = null
  private data: Uint8ClampedArray = new Uint8ClampedArray(0)
  private bw = 0
  private bh = 0
  private cssW = 0
  private cssH = 0
  // camera, resolved once per begin()
  private ex = 0; private ey = 0; private ez = 0
  private rx = 1; private rz = 0
  private ux = 0; private uy = 1; private uz = 0
  private fx = 0; private fy = 0; private fz = -1
  private focalPx = 1
  private centreX = 0
  private centreY = 0
  /** Buffer pixels per CSS pixel. */
  scale = 1
  /** Points added since begin() that reached the buffer. */
  drawn = 0

  constructor(private readonly maxPixels = 1_800_000) {
    this.canvas = document.createElement('canvas')
    this.glow = document.createElement('canvas')
    this.ctx = this.canvas.getContext('2d')
    this.glowCtx = this.glow.getContext('2d')
  }

  /** Size the buffer for a view of cssW by cssH. Device pixel ratio is capped at 2 and the buffer at maxPixels. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const ratio = Math.min(dpr || 1, 2)
    const fit = Math.min(1, Math.sqrt(this.maxPixels / Math.max(1, cssW * cssH * ratio * ratio)))
    const bw = Math.max(2, Math.round(cssW * ratio * fit)), bh = Math.max(2, Math.round(cssH * ratio * fit))
    this.cssW = cssW
    this.cssH = cssH
    if (bw === this.bw && bh === this.bh) return
    this.bw = bw
    this.bh = bh
    this.scale = bw / Math.max(1, cssW)
    this.canvas.width = bw
    this.canvas.height = bh
    this.glow.width = Math.ceil(bw / 4)
    this.glow.height = Math.ceil(bh / 4)
    this.image = this.ctx ? this.ctx.createImageData(bw, bh) : null
    this.data = this.image ? this.image.data : new Uint8ClampedArray(bw * bh * 4)
  }

  /** Clear the buffer and fix the camera for this frame. */
  begin(camera: Camera): void {
    this.clear()
    this.aim(camera)
  }

  /** Clear the buffer without a camera: for callers that only splat() in screen space. */
  clear(): void {
    this.data.fill(0)
    this.drawn = 0
  }

  /** Change the camera without clearing: two views can be added into one frame (a cross-fade). */
  aim(camera: Camera): void {
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch)
    this.ex = camera.tx + camera.distance * sy * cp
    this.ey = camera.ty + camera.distance * sp
    this.ez = camera.tz + camera.distance * cy * cp
    this.rx = cy; this.rz = -sy                                       // right
    this.ux = -sy * sp; this.uy = cp; this.uz = -cy * sp              // up
    this.fx = -sy * cp; this.fy = -sp; this.fz = -cy * cp             // forward
    this.focalPx = camera.focal * Math.min(this.bw, this.bh)
    this.centreX = (camera.cx ?? 0.5) * this.bw
    this.centreY = (camera.cy ?? 0.5) * this.bh
  }

  /**
   * World point to CSS pixels. Returns depth (0 if behind the eye) and writes
   * x, y into `out`. For the caller's own lines and labels.
   */
  project(x: number, y: number, z: number, out: { x: number; y: number }): number {
    const dx = x - this.ex, dy = y - this.ey, dz = z - this.ez
    const depth = dx * this.fx + dy * this.fy + dz * this.fz
    if (depth < 0.05) return 0
    out.x = (this.centreX + this.focalPx * (dx * this.rx + dz * this.rz) / depth) / this.scale
    out.y = (this.centreY - this.focalPx * (dx * this.ux + dy * this.uy + dz * this.uz) / depth) / this.scale
    return depth
  }

  /**
   * CSS pixels to the world point that lies `depth` in front of the eye on
   * that pixel's ray: the inverse of project(). Lets something drawn flat on
   * the screen be picked up as points in the scene.
   */
  unproject(cssX: number, cssY: number, depth: number, out: { x: number; y: number; z: number }): void {
    const a = (cssX * this.scale - this.centreX) * depth / this.focalPx
    const b = -(cssY * this.scale - this.centreY) * depth / this.focalPx
    out.x = this.ex + this.fx * depth + this.rx * a + this.ux * b
    out.y = this.ey + this.fy * depth + this.uy * b
    out.z = this.ez + this.fz * depth + this.rz * a + this.uz * b
  }

  /**
   * Add one point. `size` is its diameter in world units; a point smaller
   * than a pixel is drawn as one pixel and dimmed by its area, so density
   * holds its brightness as the camera pulls away. `fog` dims with depth.
   */
  add(x: number, y: number, z: number, size: number, r: number, g: number, b: number, alpha: number, fog = 0): void {
    const dx = x - this.ex, dy = y - this.ey, dz = z - this.ez
    const depth = dx * this.fx + dy * this.fy + dz * this.fz
    if (depth < 0.05) return
    const k = this.focalPx / depth
    const px = this.centreX + k * (dx * this.rx + dz * this.rz)
    const py = this.centreY - k * (dx * this.ux + dy * this.uy + dz * this.uz)
    let s = size * k
    let a = alpha
    if (fog) a *= Math.exp(-fog * depth)
    if (s < 1) { a *= s * s; s = 1 }
    if (a < 0.004) return
    this.splat(px, py, s > 6 ? 6 : s, r, g, b, a)
  }

  /** Add a point already in buffer pixels (see `scale`), with its diameter in buffer pixels. */
  splat(px: number, py: number, s: number, r: number, g: number, b: number, a: number): void {
    const bw = this.bw, bh = this.bh, d = this.data
    if (px < -3 || py < -3 || px > bw + 3 || py > bh + 3) return
    this.drawn++
    if (s <= 1.5) {
      // Shared between the four nearest pixels: sub-pixel motion stays smooth.
      const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5)
      const fx = px - 0.5 - x0, fy = py - 0.5 - y0
      const gain = a * s * s
      for (let j = 0; j < 2; j++) {
        const y = y0 + j
        if (y < 0 || y >= bh) continue
        const wy = j ? fy : 1 - fy
        for (let i = 0; i < 2; i++) {
          const x = x0 + i
          if (x < 0 || x >= bw) continue
          const w = gain * wy * (i ? fx : 1 - fx)
          const o = (y * bw + x) * 4
          d[o] += r * w; d[o + 1] += g * w; d[o + 2] += b * w; d[o + 3] = 255
        }
      }
      return
    }
    const rad = s / 2
    const x0 = Math.max(0, Math.floor(px - rad - 0.5)), x1 = Math.min(bw - 1, Math.ceil(px + rad + 0.5))
    const y0 = Math.max(0, Math.floor(py - rad - 0.5)), y1 = Math.min(bh - 1, Math.ceil(py + rad + 0.5))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ox = x + 0.5 - px, oy = y + 0.5 - py
        const w = rad + 0.5 - Math.sqrt(ox * ox + oy * oy)
        if (w <= 0) continue
        const wa = a * (w > 1 ? 1 : w)
        const o = (y * bw + x) * 4
        d[o] += r * wa; d[o + 1] += g * wa; d[o + 2] += b * wa; d[o + 3] = 255
      }
    }
  }

  /** A vertical hairline between two projected heights, in CSS pixels. */
  hairline(cssX: number, cssY0: number, cssY1: number, r: number, g: number, b: number, a: number): void {
    const x = Math.round(cssX * this.scale)
    if (x < 0 || x >= this.bw) return
    let y0 = Math.round(Math.min(cssY0, cssY1) * this.scale), y1 = Math.round(Math.max(cssY0, cssY1) * this.scale)
    y0 = Math.max(0, y0); y1 = Math.min(this.bh - 1, y1)
    const d = this.data
    for (let y = y0; y <= y1; y++) {
      const o = (y * this.bw + x) * 4
      d[o] += r * a; d[o + 1] += g * a; d[o + 2] += b * a; d[o + 3] = 255
    }
  }

  /**
   * Show the frame on `target` (a context whose units are CSS pixels): the
   * sharp layer, then the blurred quarter-size copy twice for the glow.
   */
  end(target: CanvasRenderingContext2D, alpha = 1, bloom = 0.8): void {
    if (!this.ctx || !this.image) return
    this.ctx.putImageData(this.image, 0, 0)
    target.save()
    target.globalCompositeOperation = 'lighter'
    target.imageSmoothingEnabled = true
    target.imageSmoothingQuality = 'high'
    target.globalAlpha = alpha
    target.drawImage(this.canvas, 0, 0, this.cssW, this.cssH)
    if (bloom > 0 && this.glowCtx) {
      const g = this.glowCtx
      g.clearRect(0, 0, this.glow.width, this.glow.height)
      g.filter = 'blur(2px)'                                          // ignored where unsupported; the upscale still softens
      g.drawImage(this.canvas, 0, 0, this.glow.width, this.glow.height)
      target.globalAlpha = alpha * bloom
      target.drawImage(this.glow, 0, 0, this.cssW, this.cssH)
      target.drawImage(this.glow, -8, -8, this.cssW + 16, this.cssH + 16)
    }
    target.restore()
  }
}
