import {
  AdditiveBlending,
  BufferAttribute,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  GLSL1,
  HalfFloatType,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  NoBlending,
  NoToneMapping,
  NormalBlending,
  OrthographicCamera,
  RGBAFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type Blending,
  type Side,
} from 'three'
import {
  FrameBudgetGovernor,
  computeObliqueProjection,
  probeHalfFloatRenderTarget,
  profileForTier,
  resolveVfxProfile,
  vfxQualityStore,
  type VfxDeviceInput,
  type VfxProfile,
  type VfxQualitySetting,
  type VfxTier,
} from './vfx-quality'

/** Color lookup rows baked into the 64x8 procedural HDR gradient LUT texture. */
export const enum LutRow {
  Amber = 0,
  Cyan = 1,
  Red = 2,
  Violet = 3,
  Grove = 4,
  Court = 5,
  Carcosa = 6,
  Probe = 7,
}

export const enum ParticleShape {
  Spark = 0,
  Mote = 1,
  Shard = 2,
  Ash = 3,
  Droplet = 4,
  Cuboid = 5,
  Triangle = 6,
}

export const enum RibbonStyle {
  Beam = 0,
  Slash = 1,
  Trail = 2,
  Arc = 3,
  VectorRay = 4,
  TwinHitscan = 5,
  TractorDash = 6,
  SawtoothZigzag = 7,
  SilkMist = 8,
  PlasmaFlame = 9,
  DataStream = 10,
}

export const enum SolidKind {
  Wedge = 0,
  Monolith = 1,
  CornerBracket = 2,
  HexPlate = 3,
  NullGlyph = 4,
  Spike = 5,
  Octahedron = 6,
  ScanPlane = 7,
  Orb = 8,
}

export const enum CloudMode {
  Mist = 0,
  Plume = 1,
  Corona = 2,
  LiquidCell = 3,
  JiQiVortex = 4,
  PlasmaFlow = 5,
}

export const enum DecalKind {
  Spill = 0,
  Tile = 1,
  Flood = 2,
  Fracture = 3,
}

export const enum WaveMode {
  Shock = 0,
  Gimbal = 1,
  Slice = 2,
  Manifold = 3,
}

export type VfxBackend = 'webgl2' | '2d'

export type VfxStats = {
  backend: VfxBackend
  setting: VfxQualitySetting
  tier: VfxTier
  hdrFloat: boolean
  contextLost: boolean
  activeParticles: number
  activeRibbons: number
  activeWaves: number
  activeDecals: number
  activeSolids: number
  activeClouds: number
  peakParticles: number
  peakRibbons: number
  peakSolids: number
  peakClouds: number
  renderPassesLastFrame: number
  totalRenderedFrames: number
  vramBytesApprox: number
}

export type ParticleSpawn = {
  x: number
  y: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
  life: number
  size?: number
  drag?: number
  gravZ?: number
  curl?: number
  bounce?: number
  homeX?: number
  homeY?: number
  lut: LutRow
  shape: ParticleShape
  seed?: number
}

export type RibbonSpawn = {
  ax: number
  ay: number
  az: number
  cx: number
  cy: number
  cz: number
  bx: number
  by: number
  bz: number
  width: number
  dur: number
  lut: LutRow
  style: RibbonStyle
  seed?: number
  spin?: number
}

export type WaveSpawn = {
  x: number
  y: number
  z: number
  r0: number
  r1: number
  pitchX?: number
  rollY?: number
  thickness?: number
  dur: number
  lut: LutRow
  mode: WaveMode
}

export type DomeSpawn = {
  x: number
  y: number
  z: number
  r0: number
  r1: number
  dur: number
  lut: LutRow
  /** True renders a premultiplied dark singularity void with a bright Fresnel rim. */
  voidOrb?: boolean
}

export type DecalSpawn = {
  x: number
  y: number
  radius: number
  rot?: number
  dur: number
  lut: LutRow
  kind: DecalKind
}

export type SolidSpawn = {
  kind: SolidKind
  x0: number
  y0: number
  z0: number
  x1?: number
  y1?: number
  z1?: number
  sx: number
  sy: number
  sz: number
  scaleEnd?: number
  yaw?: number
  spin?: number
  pitch0?: number
  pitch1?: number
  dur: number
  lut: LutRow
  quantSteps?: number
  wireOnly?: number
}

export type CloudSpawn = {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  radius: number
  endRadius?: number
  height?: number
  dur: number
  lut: LutRow
  mode: CloudMode
  seed?: number
  dark?: boolean
  whirlpool?: boolean
  /** PlasmaFlow (`mode === 5`) controls: 0 = directed plume, 1 = smin Cross, 2 = smin Squircle, 3 = wide Ultra wake. */
  flowStyle?: number
  /** Extra alpha-erosion dissolve bias for PlasmaFlow (`-0.25 .. 0.35`). */
  erosion?: number
  /** Nominal reach half-length in board cells for PlasmaFlow SDF (quad `radius` carries warp padding). */
  spanLen?: number
  /** Nominal half-width in board cells for PlasmaFlow SDF (quad `endRadius` carries warp padding). */
  nomWid?: number
}

const DECAL_STRIDE = 4
const RIBBON_STRIDE = 4
const WAVE_STRIDE = 4
const DOME_STRIDE = 4
const PART_STRIDE = 4
const SOLID_KIND_COUNT = 9
const SOLID_PER_KIND_CAP = 48
const CLOUD_ADD_CAP = 160
const CLOUD_DARK_CAP = 64

function buildBrushNoiseTexture(): { texture: DataTexture; bytes: number } {
  const size = 128
  const data = new Uint8Array(size * size * 4)

  const hash2 = (ix: number, iy: number, period: number, salt: number): number => {
    const x = ((ix % period) + period) % period
    const y = ((iy % period) + period) % period
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(salt, 1274126177)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }

  const periodicValueNoise = (u: number, v: number, cells: number, salt: number): number => {
    const px = u * cells
    const py = v * cells
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    const fx = px - x0
    const fy = py - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const n00 = hash2(x0, y0, cells, salt)
    const n10 = hash2(x0 + 1, y0, cells, salt)
    const n01 = hash2(x0, y0 + 1, cells, salt)
    const n11 = hash2(x0 + 1, y0 + 1, cells, salt)
    const nx0 = n00 + (n10 - n00) * sx
    const nx1 = n01 + (n11 - n01) * sx
    return nx0 + (nx1 - nx0) * sy
  }

  const periodicVoronoi = (u: number, v: number, cells: number, salt: number): number => {
    const px = u * cells
    const py = v * cells
    const x0 = Math.floor(px)
    const y0 = Math.floor(py)
    let d1 = 9
    let d2 = 9
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = x0 + dx
        const cy = y0 + dy
        const jx = cx + 0.15 + 0.7 * hash2(cx, cy, cells, salt)
        const jy = cy + 0.15 + 0.7 * hash2(cx, cy, cells, salt + 97)
        const dist = Math.hypot(jx - px, jy - py)
        if (dist < d1) {
          d2 = d1
          d1 = dist
        } else if (dist < d2) {
          d2 = dist
        }
      }
    }
    return Math.max(0, Math.min(1, d2 - d1))
  }

  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const idx = (y * size + x) * 4

      const vor = Math.min(1, periodicVoronoi(u, v, 6, 11) * 1.45)
      const fbm =
        0.52 * periodicValueNoise(u, v, 6, 23) +
        0.31 * periodicValueNoise(u, v, 12, 41) +
        0.17 * periodicValueNoise(u, v, 24, 79)
      const streak =
        0.6 * periodicValueNoise(u, v * 3.0, 4, 103) +
        0.4 * periodicValueNoise(u, v * 6.0, 8, 137)
      const grain = hash2(x, y, size, 199)

      data[idx] = Math.round(vor * 255)
      data[idx + 1] = Math.round(fbm * 255)
      data[idx + 2] = Math.round(streak * 255)
      data[idx + 3] = Math.round(grain * 255)
    }
  }

  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return { texture: tex, bytes: data.byteLength }
}

type RgbStop = [number, [number, number, number], number]

function buildGradientLutTexture(): { texture: DataTexture; bytes: number } {
  const width = 64
  const height = 8
  const data = new Uint8Array(width * height * 4)

  const palettes: RgbStop[][] = [
    // 0: VECTOR Amber (deep saturated amber body; white-hot HDR strictly at 0.90+)
    [
      [0.0, [42, 20, 5], 0.72],
      [0.3, [255, 136, 36], 1.15],
      [0.64, [255, 198, 78], 1.75],
      [0.88, [255, 238, 178], 2.7],
      [1.0, [255, 252, 238], 3.8],
    ],
    // 1: CoT Cyan
    [
      [0.0, [9, 27, 44], 0.72],
      [0.3, [48, 158, 255], 1.2],
      [0.64, [88, 228, 255], 1.85],
      [0.88, [216, 249, 255], 2.8],
      [1.0, [246, 254, 255], 3.8],
    ],
    // 2: GEEKS Red
    [
      [0.0, [41, 7, 18], 0.72],
      [0.3, [225, 36, 98], 1.18],
      [0.64, [255, 93, 115], 1.8],
      [0.88, [255, 204, 212], 2.7],
      [1.0, [255, 245, 247], 3.6],
    ],
    // 3: OVERLOAD Violet
    [
      [0.0, [25, 12, 48], 0.8],
      [0.32, [94, 230, 255], 1.25],
      [0.66, [167, 139, 250], 1.95],
      [0.88, [232, 218, 255], 2.9],
      [1.0, [252, 248, 255], 3.8],
    ],
    // 4: GROVE Dark Young
    [
      [0.0, [13, 24, 8], 0.72],
      [0.32, [77, 107, 42], 1.15],
      [0.65, [159, 203, 107], 1.8],
      [0.88, [224, 252, 148], 2.75],
      [1.0, [250, 255, 240], 3.6],
    ],
    // 5: COURT Queen in Red
    [
      [0.0, [36, 4, 9], 0.72],
      [0.32, [196, 22, 46], 1.25],
      [0.66, [235, 68, 88], 1.85],
      [0.88, [243, 237, 226], 2.7],
      [1.0, [255, 250, 248], 3.6],
    ],
    // 6: CARCOSA Hastur
    [
      [0.0, [36, 22, 5], 0.72],
      [0.32, [200, 138, 40], 1.2],
      [0.66, [255, 198, 82], 1.9],
      [0.88, [255, 241, 188], 2.8],
      [1.0, [255, 252, 240], 3.7],
    ],
    // 7: PROBE / Neutral White-Steel
    [
      [0.0, [24, 28, 32], 0.68],
      [0.32, [136, 134, 128], 1.05],
      [0.65, [121, 191, 255], 1.55],
      [0.88, [238, 242, 246], 2.4],
      [1.0, [255, 255, 255], 3.3],
    ],
  ]

  for (let row = 0; row < height; row++) {
    const stops = palettes[row]
    for (let x = 0; x < width; x++) {
      const t = x / (width - 1)
      let i = 0
      while (i < stops.length - 2 && t > stops[i + 1][0]) i++
      const s0 = stops[i]
      const s1 = stops[i + 1]
      const span = Math.max(1e-5, s1[0] - s0[0])
      const f = Math.max(0, Math.min(1, (t - s0[0]) / span))
      const r = s0[1][0] + (s1[1][0] - s0[1][0]) * f
      const g = s0[1][1] + (s1[1][1] - s0[1][1]) * f
      const b = s0[1][2] + (s1[1][2] - s0[1][2]) * f
      const hdr = s0[2] + (s1[2] - s0[2]) * f
      const hdrNorm = Math.max(0, Math.min(1, (hdr - 0.5) / 4.0))

      const idx = (row * width + x) * 4
      data[idx] = Math.round(r)
      data[idx + 1] = Math.round(g)
      data[idx + 2] = Math.round(b)
      data[idx + 3] = Math.round(hdrNorm * 255)
    }
  }

  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return { texture: tex, bytes: data.byteLength }
}

function makeFullscreenTriangleGeometry(): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 1
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2))
  return geo
}

function makeInstancedQuadGeometry(): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 0
  geo.setAttribute(
    'aQuad',
    new BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2),
  )
  geo.setIndex([0, 1, 2, 0, 2, 3])
  return geo
}

function makeInstancedRibbonGeometry(segments = 40): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 0
  const verts = new Float32Array((segments + 1) * 2 * 2)
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    const base = i * 4
    verts[base] = u
    verts[base + 1] = -1
    verts[base + 2] = u
    verts[base + 3] = 1
    if (i < segments) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, c, b, b, c, d)
    }
  }
  geo.setAttribute('aStrip', new BufferAttribute(verts, 2))
  geo.setIndex(indices)
  return geo
}

function makeInstancedRingGeometry(segments = 32): InstancedBufferGeometry {
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 0
  const verts = new Float32Array((segments + 1) * 2 * 2)
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    const base = i * 4
    verts[base] = u
    verts[base + 1] = -0.5
    verts[base + 2] = u
    verts[base + 3] = 0.5
    if (i < segments) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, c, b, b, c, d)
    }
  }
  geo.setAttribute('aRing', new BufferAttribute(verts, 2))
  geo.setIndex(indices)
  return geo
}

function makeInstancedDomeGeometry(): InstancedBufferGeometry {
  const ico = new IcosahedronGeometry(1, 2)
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 0
  geo.setAttribute('position', ico.getAttribute('position').clone())
  if (ico.getIndex()) geo.setIndex(ico.getIndex()!.clone())
  ico.dispose()
  return geo
}

type Vec3 = [number, number, number]

function makeSolidGeometry(kind: SolidKind): { geo: InstancedBufferGeometry; bytes: number } {
  const pos: number[] = []
  const norm: number[] = []
  const edge: number[] = []

  const faceNorm = (a: Vec3, b: Vec3, c: Vec3): Vec3 => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const l = Math.hypot(nx, ny, nz) || 1
    return [nx / l, ny / l, nz / l]
  }

  const pushTriRaw = (a: Vec3, b: Vec3, c: Vec3, ea: [number, number, number, number], eb: [number, number, number, number], ec: [number, number, number, number], n?: Vec3) => {
    const fn = n ?? faceNorm(a, b, c)
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    norm.push(fn[0], fn[1], fn[2], fn[0], fn[1], fn[2], fn[0], fn[1], fn[2])
    edge.push(ea[0], ea[1], ea[2], ea[3], eb[0], eb[1], eb[2], eb[3], ec[0], ec[1], ec[2], ec[3])
  }

  const pushTri = (a: Vec3, b: Vec3, c: Vec3) => {
    pushTriRaw(a, b, c, [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0])
  }

  const pushQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, mode = 1) => {
    const fn = faceNorm(a, b, c)
    pushTriRaw(a, b, c, [0, 0, 0, mode], [1, 0, 0, mode], [1, 1, 0, mode], fn)
    pushTriRaw(a, c, d, [0, 0, 0, mode], [1, 1, 0, mode], [0, 1, 0, mode], fn)
  }

  const pushBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rotZ = 0) => {
    const cr = Math.cos(rotZ), sr = Math.sin(rotZ)
    const pt = (x: number, y: number, z: number): Vec3 =>
      rotZ === 0 ? [x, y, z] : [x * cr - y * sr, x * sr + y * cr, z]
    const p000 = pt(x0, y0, z0), p100 = pt(x1, y0, z0), p110 = pt(x1, y1, z0), p010 = pt(x0, y1, z0)
    const p001 = pt(x0, y0, z1), p101 = pt(x1, y0, z1), p111 = pt(x1, y1, z1), p011 = pt(x0, y1, z1)
    pushQuad(p001, p101, p111, p011)
    pushQuad(p010, p110, p100, p000)
    pushQuad(p000, p100, p101, p001)
    pushQuad(p110, p010, p011, p111)
    pushQuad(p100, p110, p111, p101)
    pushQuad(p010, p000, p001, p011)
  }

  if (kind === SolidKind.Wedge) {
    const tip: Vec3 = [0.55, 0, 0.04]
    const ridge: Vec3 = [0.0, 0, 0.46]
    const lw: Vec3 = [-0.46, 0.48, 0.08]
    const rw: Vec3 = [-0.46, -0.48, 0.08]
    const back: Vec3 = [-0.20, 0, 0.18]
    const tipB: Vec3 = [0.55, 0, -0.06]
    const lwB: Vec3 = [-0.46, 0.48, -0.06]
    const rwB: Vec3 = [-0.46, -0.48, -0.06]
    const backB: Vec3 = [-0.20, 0, -0.06]
    pushTri(tip, ridge, lw)
    pushTri(tip, rw, ridge)
    pushTri(ridge, back, lw)
    pushTri(ridge, rw, back)
    pushQuad(lw, lwB, tipB, tip)
    pushQuad(tip, tipB, rwB, rw)
    pushQuad(back, backB, lwB, lw)
    pushQuad(rw, rwB, backB, back)
    pushTri(tipB, lwB, backB)
    pushTri(tipB, backB, rwB)
  } else if (kind === SolidKind.Monolith) {
    pushBox(-0.5, 0.5, -0.5, 0.5, 0.0, 1.0)
  } else if (kind === SolidKind.CornerBracket) {
    pushBox(0.06, 0.5, 0.34, 0.5, -0.22, 0.22)
    pushBox(0.34, 0.5, 0.06, 0.34, -0.22, 0.22)
  } else if (kind === SolidKind.HexPlate) {
    const topC: Vec3 = [0, 0, 0.12]
    const botC: Vec3 = [0, 0, -0.12]
    const r = 0.5
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2
      const a1 = ((k + 1) / 6) * Math.PI * 2
      const t0: Vec3 = [Math.cos(a0) * r, Math.sin(a0) * r, 0.12]
      const t1: Vec3 = [Math.cos(a1) * r, Math.sin(a1) * r, 0.12]
      const b0: Vec3 = [Math.cos(a0) * r, Math.sin(a0) * r, -0.12]
      const b1: Vec3 = [Math.cos(a1) * r, Math.sin(a1) * r, -0.12]
      pushQuad(b0, b1, t1, t0)
      pushTriRaw(t0, t1, topC, [0.5, 0, 0, 1], [0.5, 0, 0, 1], [0.5, 0.9, 0, 1], [0, 0, 1])
      pushTriRaw(b1, b0, botC, [0.5, 0, 0, 1], [0.5, 0, 0, 1], [0.5, 0.9, 0, 1], [0, 0, -1])
    }
  } else if (kind === SolidKind.NullGlyph) {
    const rIn = 0.31, rOut = 0.50, z0 = -0.11, z1 = 0.11
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2
      const a1 = ((k + 1) / 8) * Math.PI * 2
      const i0: Vec3 = [Math.cos(a0) * rIn, Math.sin(a0) * rIn, z1]
      const o0: Vec3 = [Math.cos(a0) * rOut, Math.sin(a0) * rOut, z1]
      const o1: Vec3 = [Math.cos(a1) * rOut, Math.sin(a1) * rOut, z1]
      const i1: Vec3 = [Math.cos(a1) * rIn, Math.sin(a1) * rIn, z1]
      const bi0: Vec3 = [i0[0], i0[1], z0], bo0: Vec3 = [o0[0], o0[1], z0]
      const bo1: Vec3 = [o1[0], o1[1], z0], bi1: Vec3 = [i1[0], i1[1], z0]
      pushQuad(i0, o0, o1, i1)
      pushQuad(bi1, bo1, bo0, bi0)
      pushQuad(bo0, bo1, o1, o0)
      pushQuad(i0, i1, bi1, bi0)
    }
    pushBox(-0.62, 0.62, -0.06, 0.06, -0.16, 0.16, Math.PI * 0.25)
  } else if (kind === SolidKind.Spike) {
    const apex: Vec3 = [0, 0, 1.0]
    const b0: Vec3 = [0.26, 0, 0], b1: Vec3 = [0, 0.26, 0], b2: Vec3 = [-0.26, 0, 0], b3: Vec3 = [0, -0.26, 0]
    pushTri(b0, b1, apex)
    pushTri(b1, b2, apex)
    pushTri(b2, b3, apex)
    pushTri(b3, b0, apex)
    pushQuad(b3, b2, b1, b0)
  } else if (kind === SolidKind.Octahedron) {
    const px: Vec3 = [0.5, 0, 0], nx: Vec3 = [-0.5, 0, 0]
    const py: Vec3 = [0, 0.5, 0], ny: Vec3 = [0, -0.5, 0]
    const pz: Vec3 = [0, 0, 0.5], nz: Vec3 = [0, 0, -0.5]
    pushTri(px, py, pz); pushTri(py, nx, pz); pushTri(nx, ny, pz); pushTri(ny, px, pz)
    pushTri(py, px, nz); pushTri(nx, py, nz); pushTri(ny, nx, nz); pushTri(px, ny, nz)
  } else if (kind === SolidKind.Orb) {
    const rawIco = new IcosahedronGeometry(0.5, 2)
    const ico = rawIco.index ? rawIco.toNonIndexed() : rawIco
    const pAttr = ico.getAttribute('position')
    for (let i = 0; i < pAttr.count; i++) {
      const x = pAttr.getX(i), y = pAttr.getY(i), z = pAttr.getZ(i)
      const len = Math.hypot(x, y, z) || 1
      pos.push(x, y, z)
      norm.push(x / len, y / len, z / len)
      edge.push(0, 0, 0, 3)
    }
    if (ico !== rawIco) ico.dispose()
    rawIco.dispose()
  } else {
    pushQuad([-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], 2)
  }

  const posArr = new Float32Array(pos)
  const normArr = new Float32Array(norm)
  const edgeArr = new Float32Array(edge)
  const geo = new InstancedBufferGeometry()
  geo.instanceCount = 0
  geo.setAttribute('position', new BufferAttribute(posArr, 3))
  geo.setAttribute('normal', new BufferAttribute(normArr, 3))
  geo.setAttribute('aEdge', new BufferAttribute(edgeArr, 4))
  return { geo, bytes: posArr.byteLength + normArr.byteLength + edgeArr.byteLength }
}

function createDynamicInstAttr(capacity: number, itemSize: number): InstancedBufferAttribute {
  const attr = new InstancedBufferAttribute(new Float32Array(capacity * itemSize), itemSize)
  attr.setUsage(DynamicDrawUsage)
  return attr
}

function uploadActiveRange(attr: InstancedBufferAttribute, count: number): void {
  attr.clearUpdateRanges()
  if (count > 0) attr.addUpdateRange(0, count * attr.itemSize)
  attr.needsUpdate = true
}

const SHARED_GLSL_LUT = /* glsl */ `
uniform sampler2D uLut;
uniform sampler2D uBrush;
uniform float uSceneGain;

vec4 sampleLut(float row, float energy) {
  float u = clamp(energy, 0.01, 0.99);
  float v = (clamp(row, 0.0, 7.0) + 0.5) / 8.0;
  vec4 c = texture2D(uLut, vec2(u, v));
  float hdr = 0.5 + c.a * 4.0;
  return vec4(c.rgb * hdr * uSceneGain, hdr);
}
`

function makeShaderMaterial(
  vertexShader: string,
  fragmentShader: string,
  uniforms: ShaderMaterial['uniforms'],
  blending: Blending = AdditiveBlending,
  side: Side = DoubleSide,
): ShaderMaterial {
  const mat = new ShaderMaterial({
    glslVersion: GLSL1,
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    blending,
    side,
    toneMapped: false,
  })
  mat.forceSinglePass = true
  return mat
}

export class VfxWebglEngine {
  readonly canvas: HTMLCanvasElement
  readonly hdrFloat: boolean

  private readonly gl: WebGL2RenderingContext
  private readonly deviceInput: VfxDeviceInput
  private readonly renderer: WebGLRenderer
  private readonly governor: FrameBudgetGovernor
  private profile: VfxProfile
  private setting: VfxQualitySetting
  private readonly unsubQuality: () => void
  private readonly dummyCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly fxScene = new Scene()
  private readonly postScene = new Scene()
  private readonly projMatrix = new Matrix4()
  private readonly uResolution = new Vector2(1, 1)
  private readonly uProj = { value: this.projMatrix }
  private readonly uResUniform = { value: this.uResolution }
  private readonly uCellUniform = { value: 36 }
  private readonly uSceneGainUniform = { value: 1.0 }
  private readonly uHdrUnpackUniform = { value: 1.0 }

  private readonly brushNoiseTex: DataTexture
  private readonly lutTex: DataTexture
  private readonly textureBytes: number

  // Bloom / scene targets
  private sceneTarget: WebGLRenderTarget | null = null
  private mipDown: WebGLRenderTarget[] = []
  private mipUp: WebGLRenderTarget[] = []
  private cssW = 0
  private cssH = 0
  private targetW = 0
  private targetH = 0
  private targetBytes = 0
  private geometryBytes = 0

  // Pooled GPU meshes (pre-allocated at HIGH capacity so switching Low<->High never reallocates)
  private readonly decalGeo: InstancedBufferGeometry
  private readonly decalAttrA: InstancedBufferAttribute
  private readonly decalAttrB: InstancedBufferAttribute
  private decalCount = 0

  private readonly ribbonGeo: InstancedBufferGeometry
  private readonly ribbonStart: InstancedBufferAttribute
  private readonly ribbonCtrl: InstancedBufferAttribute
  private readonly ribbonEnd: InstancedBufferAttribute
  private readonly ribbonTime: InstancedBufferAttribute
  private ribbonCount = 0

  private readonly waveGeo: InstancedBufferGeometry
  private readonly wavePos: InstancedBufferAttribute
  private readonly waveShape: InstancedBufferAttribute
  private readonly waveTime: InstancedBufferAttribute
  private waveCount = 0

  private readonly domeGeo: InstancedBufferGeometry
  private readonly domePos: InstancedBufferAttribute
  private readonly domeMeta: InstancedBufferAttribute
  private readonly domeMesh: Mesh
  private readonly domeVoidMesh: Mesh
  private readonly domeVoidGeo: InstancedBufferGeometry
  private readonly domeVoidPos: InstancedBufferAttribute
  private readonly domeVoidMeta: InstancedBufferAttribute
  private domeCount = 0
  private voidCount = 0

  private readonly partGeo: InstancedBufferGeometry
  private readonly partAttrA: InstancedBufferAttribute
  private readonly partAttrB: InstancedBufferAttribute
  private readonly partAttrC: InstancedBufferAttribute
  private partCount = 0

  // Pool E: Instanced 3D Geometric Solids (Wedge, Monolith, CornerBracket, HexPlate, NullGlyph, Spike, Octahedron, ScanPlane)
  private readonly solidPools: Array<{
    geo: InstancedBufferGeometry
    mesh: Mesh
    pos0: InstancedBufferAttribute
    pos1: InstancedBufferAttribute
    size: InstancedBufferAttribute
    rot: InstancedBufferAttribute
    time: InstancedBufferAttribute
    count: number
  }> = []

  // Pool F: Volumetric Clouds, Convection Plumes, Coronas & Flood Caustic Liquid Cells
  private readonly cloudAdd: {
    geo: InstancedBufferGeometry
    mesh: Mesh
    attrA: InstancedBufferAttribute
    attrB: InstancedBufferAttribute
    attrC: InstancedBufferAttribute
    attrD: InstancedBufferAttribute
    count: number
  }
  private readonly cloudDark: {
    geo: InstancedBufferGeometry
    mesh: Mesh
    attrA: InstancedBufferAttribute
    attrB: InstancedBufferAttribute
    attrC: InstancedBufferAttribute
    attrD: InstancedBufferAttribute
    count: number
  }

  // SoA CPU storage for particle physics (zero allocations per frame)
  private readonly pCap: number
  private readonly px: Float32Array
  private readonly py: Float32Array
  private readonly pz: Float32Array
  private readonly pvx: Float32Array
  private readonly pvy: Float32Array
  private readonly pvz: Float32Array
  private readonly plife: Float32Array
  private readonly pmax: Float32Array
  private readonly psize: Float32Array
  private readonly pdrag: Float32Array
  private readonly pgravZ: Float32Array
  private readonly pcurl: Float32Array
  private readonly pbounce: Float32Array
  private readonly phomeX: Float32Array
  private readonly phomeY: Float32Array
  private readonly plut: Float32Array
  private readonly pshape: Float32Array
  private readonly pseed: Float32Array

  // Post-processing fullscreen passes
  private readonly triGeo: InstancedBufferGeometry
  private readonly threshMat: ShaderMaterial
  private readonly downMat: ShaderMaterial
  private readonly upMat: ShaderMaterial
  private readonly compMat: ShaderMaterial
  private readonly postMesh: Mesh
  private readonly disposables: Array<{ dispose(): void }> = []

  // Lifetime/metrics
  private simTime = 0
  private contextLost = false
  private wasBusy = false
  private peakParticles = 0
  private peakRibbons = 0
  private peakSolids = 0
  private peakClouds = 0
  private renderPassesLastFrame = 0
  private totalRenderedFrames = 0
  private disposed = false

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    deviceInput: VfxDeviceInput,
    setting: VfxQualitySetting,
    initialProfile: VfxProfile,
    preserveBuffer = false,
  ) {
    this.canvas = canvas
    this.gl = gl
    this.deviceInput = deviceInput
    this.setting = setting
    this.profile = initialProfile
    this.governor = new FrameBudgetGovernor(
      initialProfile.tier,
      next => this.onTierStepDown(next),
      0.026,
      18,
      initialProfile.governorEnabled,
    )

    this.hdrFloat = probeHalfFloatRenderTarget(gl)
    this.uSceneGainUniform.value = this.hdrFloat ? 1.0 : 0.36
    this.uHdrUnpackUniform.value = this.hdrFloat ? 1.0 : 1.0 / 0.36

    this.renderer = new WebGLRenderer({
      canvas,
      context: gl,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserveBuffer,
    })
    this.renderer.autoClear = false
    this.renderer.toneMapping = NoToneMapping
    this.renderer.outputColorSpace = LinearSRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)

    const brush = buildBrushNoiseTexture()
    const lut = buildGradientLutTexture()
    this.brushNoiseTex = brush.texture
    this.lutTex = lut.texture
    this.textureBytes = brush.bytes + lut.bytes
    this.disposables.push(this.brushNoiseTex, this.lutTex)

    // Pre-allocate static HIGH-ceiling SoA pools once (~420 KB) so live tier switching has zero GC/realloc cost
    const highCap = profileForTier('high')
    this.pCap = highCap.maxParticles
    this.px = new Float32Array(this.pCap)
    this.py = new Float32Array(this.pCap)
    this.pz = new Float32Array(this.pCap)
    this.pvx = new Float32Array(this.pCap)
    this.pvy = new Float32Array(this.pCap)
    this.pvz = new Float32Array(this.pCap)
    this.plife = new Float32Array(this.pCap)
    this.pmax = new Float32Array(this.pCap)
    this.psize = new Float32Array(this.pCap)
    this.pdrag = new Float32Array(this.pCap)
    this.pgravZ = new Float32Array(this.pCap)
    this.pcurl = new Float32Array(this.pCap)
    this.pbounce = new Float32Array(this.pCap)
    this.phomeX = new Float32Array(this.pCap)
    this.phomeY = new Float32Array(this.pCap)
    this.plut = new Float32Array(this.pCap)
    this.pshape = new Float32Array(this.pCap)
    this.pseed = new Float32Array(this.pCap)

    // Pool A: Floor decals on Z = 0
    const dCap = highCap.maxDecals
    this.decalGeo = makeInstancedQuadGeometry()
    this.decalAttrA = createDynamicInstAttr(dCap, DECAL_STRIDE)
    this.decalAttrB = createDynamicInstAttr(dCap, DECAL_STRIDE)
    this.decalGeo.setAttribute('aDecalA', this.decalAttrA)
    this.decalGeo.setAttribute('aDecalB', this.decalAttrB)
    const decalMat = this.createDecalMaterial()
    const decalMesh = new Mesh(this.decalGeo, decalMat)
    decalMesh.frustumCulled = false
    decalMesh.renderOrder = 1
    this.fxScene.add(decalMesh)
    this.disposables.push(this.decalGeo, decalMat)
    this.geometryBytes += dCap * 8 * 4

    // Pool B: 3D Bezier Ribbons, CAD Rays & Zigzags
    const rCap = highCap.maxRibbons
    this.ribbonGeo = makeInstancedRibbonGeometry(56)
    this.ribbonStart = createDynamicInstAttr(rCap, RIBBON_STRIDE)
    this.ribbonCtrl = createDynamicInstAttr(rCap, RIBBON_STRIDE)
    this.ribbonEnd = createDynamicInstAttr(rCap, RIBBON_STRIDE)
    this.ribbonTime = createDynamicInstAttr(rCap, RIBBON_STRIDE)
    this.ribbonGeo.setAttribute('aRibStart', this.ribbonStart)
    this.ribbonGeo.setAttribute('aRibCtrl', this.ribbonCtrl)
    this.ribbonGeo.setAttribute('aRibEnd', this.ribbonEnd)
    this.ribbonGeo.setAttribute('aRibTime', this.ribbonTime)
    const ribbonMat = this.createRibbonMaterial()
    const ribbonMesh = new Mesh(this.ribbonGeo, ribbonMat)
    ribbonMesh.frustumCulled = false
    ribbonMesh.renderOrder = 3
    this.fxScene.add(ribbonMesh)
    this.disposables.push(this.ribbonGeo, ribbonMat)
    this.geometryBytes += rCap * 16 * 4

    // Pool C1: Tilted 3D Shockwave Crowns, Astrolabe Gimbals & Manifold Waves
    const wCap = highCap.maxWaves
    this.waveGeo = makeInstancedRingGeometry(64)
    this.wavePos = createDynamicInstAttr(wCap, WAVE_STRIDE)
    this.waveShape = createDynamicInstAttr(wCap, WAVE_STRIDE)
    this.waveTime = createDynamicInstAttr(wCap, WAVE_STRIDE)
    this.waveGeo.setAttribute('aWavePos', this.wavePos)
    this.waveGeo.setAttribute('aWaveShape', this.waveShape)
    this.waveGeo.setAttribute('aWaveTime', this.waveTime)
    const waveMat = this.createWaveMaterial()
    const waveMesh = new Mesh(this.waveGeo, waveMat)
    waveMesh.frustumCulled = false
    waveMesh.renderOrder = 2
    this.fxScene.add(waveMesh)
    this.disposables.push(this.waveGeo, waveMat)
    this.geometryBytes += wCap * 12 * 4

    // Pool C2: Fresnel Shields & Dark Ink-Void Singularity Orbs
    const domeCap = 16
    this.domeGeo = makeInstancedDomeGeometry()
    this.domePos = createDynamicInstAttr(domeCap, DOME_STRIDE)
    this.domeMeta = createDynamicInstAttr(domeCap, DOME_STRIDE)
    this.domeGeo.setAttribute('aDomePos', this.domePos)
    this.domeGeo.setAttribute('aDomeMeta', this.domeMeta)
    const domeAddMat = this.createDomeMaterial(false)
    this.domeMesh = new Mesh(this.domeGeo, domeAddMat)
    this.domeMesh.frustumCulled = false
    this.domeMesh.renderOrder = 4
    this.fxScene.add(this.domeMesh)

    this.domeVoidGeo = makeInstancedDomeGeometry()
    this.domeVoidPos = createDynamicInstAttr(domeCap, DOME_STRIDE)
    this.domeVoidMeta = createDynamicInstAttr(domeCap, DOME_STRIDE)
    this.domeVoidGeo.setAttribute('aDomePos', this.domeVoidPos)
    this.domeVoidGeo.setAttribute('aDomeMeta', this.domeVoidMeta)
    const domeVoidMat = this.createDomeMaterial(true)
    this.domeVoidMesh = new Mesh(this.domeVoidGeo, domeVoidMat)
    this.domeVoidMesh.frustumCulled = false
    this.domeVoidMesh.renderOrder = 6
    this.fxScene.add(this.domeVoidMesh)
    this.disposables.push(this.domeGeo, this.domeVoidGeo, domeAddMat, domeVoidMat)
    this.geometryBytes += domeCap * 8 * 4 * 2

    // Pool D: Instanced 3D Sparks, Motes & Shards
    this.partGeo = makeInstancedQuadGeometry()
    this.partAttrA = createDynamicInstAttr(this.pCap, PART_STRIDE)
    this.partAttrB = createDynamicInstAttr(this.pCap, PART_STRIDE)
    this.partAttrC = createDynamicInstAttr(this.pCap, PART_STRIDE)
    this.partGeo.setAttribute('aInstA', this.partAttrA)
    this.partGeo.setAttribute('aInstB', this.partAttrB)
    this.partGeo.setAttribute('aInstC', this.partAttrC)
    const partMat = this.createParticleMaterial()
    const partMesh = new Mesh(this.partGeo, partMat)
    partMesh.frustumCulled = false
    partMesh.renderOrder = 5
    this.fxScene.add(partMesh)
    this.disposables.push(this.partGeo, partMat)
    this.geometryBytes += this.pCap * 12 * 4

    // Pool E: Instanced 3D Geometric Solids
    const solidMat = this.createSolidMaterial()
    this.disposables.push(solidMat)
    for (let kind = 0; kind < SOLID_KIND_COUNT; kind++) {
      const built = makeSolidGeometry(kind as SolidKind)
      const pos0 = createDynamicInstAttr(SOLID_PER_KIND_CAP, 4)
      const pos1 = createDynamicInstAttr(SOLID_PER_KIND_CAP, 4)
      const size = createDynamicInstAttr(SOLID_PER_KIND_CAP, 4)
      const rot = createDynamicInstAttr(SOLID_PER_KIND_CAP, 4)
      const time = createDynamicInstAttr(SOLID_PER_KIND_CAP, 4)
      built.geo.setAttribute('aSolPos0', pos0)
      built.geo.setAttribute('aSolPos1', pos1)
      built.geo.setAttribute('aSolSize', size)
      built.geo.setAttribute('aSolRot', rot)
      built.geo.setAttribute('aSolTime', time)
      const mesh = new Mesh(built.geo, solidMat)
      mesh.frustumCulled = false
      mesh.visible = false
      mesh.renderOrder = 4
      this.fxScene.add(mesh)
      this.disposables.push(built.geo)
      this.geometryBytes += built.bytes + SOLID_PER_KIND_CAP * 20 * 4
      this.solidPools.push({ geo: built.geo, mesh, pos0, pos1, size, rot, time, count: 0 })
    }

    // Pool F: Volumetric Clouds & Liquid Flood Cells
    const makeCloudPool = (cap: number, dark: boolean, renderOrder: number) => {
      const geo = makeInstancedQuadGeometry()
      const attrA = createDynamicInstAttr(cap, 4)
      const attrB = createDynamicInstAttr(cap, 4)
      const attrC = createDynamicInstAttr(cap, 4)
      const attrD = createDynamicInstAttr(cap, 4)
      geo.setAttribute('aCloudA', attrA)
      geo.setAttribute('aCloudB', attrB)
      geo.setAttribute('aCloudC', attrC)
      geo.setAttribute('aCloudD', attrD)
      const mat = this.createCloudMaterial(dark)
      const mesh = new Mesh(geo, mat)
      mesh.frustumCulled = false
      mesh.visible = false
      mesh.renderOrder = renderOrder
      this.fxScene.add(mesh)
      this.disposables.push(geo, mat)
      this.geometryBytes += cap * 16 * 4
      return { geo, mesh, attrA, attrB, attrC, attrD, count: 0 }
    }
    this.cloudDark = makeCloudPool(CLOUD_DARK_CAP, true, 1)
    this.cloudAdd = makeCloudPool(CLOUD_ADD_CAP, false, 4)

    // Post-processing shaders
    this.triGeo = makeFullscreenTriangleGeometry()
    this.threshMat = this.createThresholdMaterial()
    this.downMat = this.createDownsampleMaterial()
    this.upMat = this.createUpsampleMaterial()
    this.compMat = this.createCompositeMaterial()
    this.postMesh = new Mesh(this.triGeo, this.compMat)
    this.postMesh.frustumCulled = false
    this.postScene.add(this.postMesh)
    this.disposables.push(this.triGeo, this.threshMat, this.downMat, this.upMat, this.compMat)

    canvas.addEventListener('webglcontextlost', this.onContextLost, false)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false)
    this.unsubQuality = vfxQualityStore.subscribe(this.onQualityChange)
  }

  /**
   * Attempts to initialize a WebGL2 overlay engine inside `stage`.
   * Returns null gracefully when WebGL2 is unavailable, letting `AttackFx` run on Canvas 2D.
   */
  static create(stage: HTMLElement): VfxWebglEngine | null {
    const canvas = document.createElement('canvas')
    canvas.className = 'vfx-canvas'
    canvas.setAttribute('aria-hidden', 'true')

    const preserveBuffer =
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { __VFX_PRESERVE_BUFFER__?: boolean }).__VFX_PRESERVE_BUFFER__)

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: preserveBuffer,
    })
    if (!gl) return null

    let rendererInfo = ''
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) rendererInfo = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '')
      else rendererInfo = String(gl.getParameter(gl.RENDERER) ?? '')
    } catch {
      rendererInfo = ''
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined
    const shortSidePx =
      typeof window !== 'undefined' ? Math.min(window.innerWidth || 1280, window.innerHeight || 720) : 1024
    const coarsePointer =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false

    const deviceInput: VfxDeviceInput = {
      hasWebGL: true,
      rendererInfo,
      deviceMemoryGb: nav?.deviceMemory,
      cores: nav?.hardwareConcurrency,
      shortSidePx,
      coarsePointer,
    }
    const setting = vfxQualityStore.getSnapshot()
    const profile = resolveVfxProfile(deviceInput, setting)

    try {
      const engine = new VfxWebglEngine(canvas, gl, deviceInput, setting, profile, preserveBuffer)
      stage.appendChild(canvas)
      return engine
    } catch {
      return null
    }
  }

  get densityScale(): number {
    return this.profile.densityScale
  }

  get currentProfile(): VfxProfile {
    return this.profile
  }

  get isAvailable(): boolean {
    return !this.disposed && !this.contextLost
  }

  get isWebglActive(): boolean {
    return this.isAvailable && this.profile.tier !== 'low'
  }

  private onQualityChange = (): void => {
    if (this.disposed) return
    this.setting = vfxQualityStore.getSnapshot()
    this.profile = resolveVfxProfile(this.deviceInput, this.setting)
    this.governor.setMode(this.profile.tier, this.profile.governorEnabled)

    if (this.profile.tier === 'low') {
      this.clear()
      this.disposeTargets()
      this.cssW = 0
      this.cssH = 0
      this.targetW = 0
      this.targetH = 0
      return
    }

    const w = this.cssW
    const h = this.cssH
    this.cssW = 0
    this.cssH = 0
    if (w > 0 && h > 0) {
      this.resize(w, h, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    }
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.contextLost = true
    this.clear()
  }

  private onContextRestored = (): void => {
    if (this.disposed) return
    this.contextLost = false
    this.brushNoiseTex.needsUpdate = true
    this.lutTex.needsUpdate = true
    this.decalAttrA.needsUpdate = true
    this.decalAttrB.needsUpdate = true
    this.ribbonStart.needsUpdate = true
    this.ribbonCtrl.needsUpdate = true
    this.ribbonEnd.needsUpdate = true
    this.ribbonTime.needsUpdate = true
    this.wavePos.needsUpdate = true
    this.waveShape.needsUpdate = true
    this.waveTime.needsUpdate = true
    this.domePos.needsUpdate = true
    this.domeMeta.needsUpdate = true
    this.domeVoidPos.needsUpdate = true
    this.domeVoidMeta.needsUpdate = true
    this.partAttrA.needsUpdate = true
    this.partAttrB.needsUpdate = true
    this.partAttrC.needsUpdate = true
    for (const pool of this.solidPools) {
      pool.pos0.needsUpdate = true
      pool.pos1.needsUpdate = true
      pool.size.needsUpdate = true
      pool.rot.needsUpdate = true
      pool.time.needsUpdate = true
    }
    for (const pool of [this.cloudAdd, this.cloudDark]) {
      pool.attrA.needsUpdate = true
      pool.attrB.needsUpdate = true
      pool.attrC.needsUpdate = true
      pool.attrD.needsUpdate = true
    }
    this.disposeTargets()
    const w = this.cssW
    const h = this.cssH
    this.cssW = 0
    this.cssH = 0
    if (this.profile.tier !== 'low' && w > 0 && h > 0) {
      this.resize(w, h, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    }
    this.wasBusy = true
  }

  private onTierStepDown(nextTier: VfxTier): void {
    this.profile = profileForTier(nextTier, false)
    const w = this.cssW
    const h = this.cssH
    this.cssW = 0
    this.cssH = 0
    if (nextTier === 'low') {
      this.clear()
      this.disposeTargets()
      return
    }
    if (w > 0 && h > 0) {
      this.resize(w, h, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    }
  }

  private disposeTargets(): void {
    this.sceneTarget?.dispose()
    this.sceneTarget = null
    for (const t of this.mipDown) t.dispose()
    for (const t of this.mipUp) t.dispose()
    this.mipDown = []
    this.mipUp = []
    this.targetBytes = 0
  }

  resize(cssWidth: number, cssHeight: number, rawDpr: number): void {
    if (this.disposed || this.profile.tier === 'low') return
    const w = Math.max(1, Math.round(cssWidth))
    const h = Math.max(1, Math.round(cssHeight))
    const dpr = Math.min(Math.max(1, rawDpr || 1), this.profile.maxDpr)
    const maxPixels = this.profile.maxFboPixels
    const desiredScale = dpr * this.profile.sceneScale
    const capScale = Math.sqrt(maxPixels / Math.max(1, w * h))
    const effScale = Math.max(0.45, Math.min(desiredScale, capScale))
    const tw = Math.max(32, Math.round(w * effScale))
    const th = Math.max(32, Math.round(h * effScale))

    if (w === this.cssW && h === this.cssH && tw === this.targetW && th === this.targetH && this.sceneTarget) {
      return
    }
    this.cssW = w
    this.cssH = h
    this.targetW = tw
    this.targetH = th
    this.uResolution.set(w, h)

    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.disposeTargets()

    const type = this.hdrFloat ? HalfFloatType : UnsignedByteType
    const bpp = this.hdrFloat ? 8 : 4
    const makeRt = (rw: number, rh: number): WebGLRenderTarget =>
      new WebGLRenderTarget(rw, rh, {
        format: RGBAFormat,
        type,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        samples: 0,
        generateMipmaps: false,
        colorSpace: LinearSRGBColorSpace,
      })

    this.sceneTarget = makeRt(tw, th)
    let totalTargetPixels = tw * th
    const levels = Math.max(2, this.profile.bloomLevels || 2)
    let mw = tw
    let mh = th
    for (let i = 0; i < levels; i++) {
      mw = Math.max(8, Math.floor(mw / 2))
      mh = Math.max(8, Math.floor(mh / 2))
      this.mipDown.push(makeRt(mw, mh))
      totalTargetPixels += mw * mh
      if (i < levels - 1) {
        this.mipUp.push(makeRt(mw, mh))
        totalTargetPixels += mw * mh
      }
    }
    this.targetBytes = totalTargetPixels * bpp
  }

  spawnParticle(p: ParticleSpawn): void {
    const cap = Math.min(this.pCap, this.profile.maxParticles)
    if (this.partCount >= cap || this.disposed) return
    const i = this.partCount++
    this.px[i] = p.x
    this.py[i] = p.y
    this.pz[i] = p.z ?? 0.15
    this.pvx[i] = p.vx ?? 0
    this.pvy[i] = p.vy ?? 0
    this.pvz[i] = p.vz ?? 0
    const life = Math.max(0.02, p.life)
    this.plife[i] = life
    this.pmax[i] = life
    this.psize[i] = p.size ?? 2.2
    this.pdrag[i] = p.drag ?? 2.6
    this.pgravZ[i] = p.gravZ ?? -5.0
    this.pcurl[i] = p.curl ?? 0
    this.pbounce[i] = p.bounce ?? 0.38
    this.phomeX[i] = p.homeX ?? -1
    this.phomeY[i] = p.homeY ?? -1
    this.plut[i] = p.lut
    this.pshape[i] = p.shape
    this.pseed[i] = p.seed ?? Math.random()
    if (this.partCount > this.peakParticles) this.peakParticles = this.partCount
  }

  spawnRibbon(r: RibbonSpawn): void {
    const cap = Math.min(this.ribbonStart.count, this.profile.maxRibbons)
    if (this.ribbonCount >= cap || this.disposed) return
    const i = this.ribbonCount++
    const base = i * 4
    const sArr = this.ribbonStart.array as Float32Array
    const cArr = this.ribbonCtrl.array as Float32Array
    const eArr = this.ribbonEnd.array as Float32Array
    const tArr = this.ribbonTime.array as Float32Array
    sArr[base] = r.ax; sArr[base + 1] = r.ay; sArr[base + 2] = r.az; sArr[base + 3] = r.width
    cArr[base] = r.cx; cArr[base + 1] = r.cy; cArr[base + 2] = r.cz; cArr[base + 3] = r.lut
    eArr[base] = r.bx; eArr[base + 1] = r.by; eArr[base + 2] = r.bz; eArr[base + 3] = r.style
    tArr[base] = 0; tArr[base + 1] = Math.max(0.03, r.dur); tArr[base + 2] = r.seed ?? Math.random() * 6.283; tArr[base + 3] = r.spin ?? 0
    if (this.ribbonCount > this.peakRibbons) this.peakRibbons = this.ribbonCount
  }

  spawnWave(w: WaveSpawn): void {
    const cap = Math.min(this.wavePos.count, this.profile.maxWaves)
    if (this.waveCount >= cap || this.disposed) return
    const i = this.waveCount++
    const base = i * 4
    const pArr = this.wavePos.array as Float32Array
    const sArr = this.waveShape.array as Float32Array
    const tArr = this.waveTime.array as Float32Array
    pArr[base] = w.x; pArr[base + 1] = w.y; pArr[base + 2] = w.z; pArr[base + 3] = w.lut
    sArr[base] = w.r0; sArr[base + 1] = w.r1; sArr[base + 2] = w.pitchX ?? 0.52; sArr[base + 3] = w.rollY ?? 0
    tArr[base] = 0; tArr[base + 1] = Math.max(0.04, w.dur); tArr[base + 2] = w.thickness ?? 0.16; tArr[base + 3] = w.mode
  }

  spawnDome(d: DomeSpawn): void {
    if (this.disposed || this.profile.tier === 'low') return
    if (d.voidOrb) {
      if (this.voidCount >= this.domeVoidPos.count) return
      const i = this.voidCount++
      const base = i * 4
      const pArr = this.domeVoidPos.array as Float32Array
      const mArr = this.domeVoidMeta.array as Float32Array
      pArr[base] = d.x; pArr[base + 1] = d.y; pArr[base + 2] = d.z; pArr[base + 3] = d.r0
      mArr[base] = d.r1; mArr[base + 1] = 0; mArr[base + 2] = Math.max(0.04, d.dur); mArr[base + 3] = d.lut
      return
    }
    if (this.domeCount >= this.domePos.count) return
    const i = this.domeCount++
    const base = i * 4
    const pArr = this.domePos.array as Float32Array
    const mArr = this.domeMeta.array as Float32Array
    pArr[base] = d.x; pArr[base + 1] = d.y; pArr[base + 2] = d.z; pArr[base + 3] = d.r0
    mArr[base] = d.r1; mArr[base + 1] = 0; mArr[base + 2] = Math.max(0.04, d.dur); mArr[base + 3] = d.lut
  }

  spawnDecal(d: DecalSpawn): void {
    const cap = Math.min(this.decalAttrA.count, this.profile.maxDecals)
    if (this.decalCount >= cap || this.disposed) return
    const i = this.decalCount++
    const base = i * 4
    const aArr = this.decalAttrA.array as Float32Array
    const bArr = this.decalAttrB.array as Float32Array
    aArr[base] = d.x; aArr[base + 1] = d.y; aArr[base + 2] = d.radius; aArr[base + 3] = d.rot ?? 0
    bArr[base] = 0; bArr[base + 1] = Math.max(0.04, d.dur); bArr[base + 2] = d.lut; bArr[base + 3] = d.kind
  }

  private totalSolidCount(): number {
    let total = 0
    for (const pool of this.solidPools) total += pool.count
    return total
  }

  private totalCloudCount(): number {
    return this.cloudAdd.count + this.cloudDark.count
  }

  spawnSolid(s: SolidSpawn): void {
    if (this.disposed || this.profile.tier === 'low') return
    const total = this.totalSolidCount()
    if (total >= this.profile.maxSolids) return
    const pool = this.solidPools[s.kind]
    if (!pool || pool.count >= SOLID_PER_KIND_CAP) return
    const i = pool.count++
    const b = i * 4
    const p0 = pool.pos0.array as Float32Array
    const p1 = pool.pos1.array as Float32Array
    const sz = pool.size.array as Float32Array
    const rt = pool.rot.array as Float32Array
    const tm = pool.time.array as Float32Array
    p0[b] = s.x0; p0[b + 1] = s.y0; p0[b + 2] = s.z0; p0[b + 3] = s.sx
    p1[b] = s.x1 ?? s.x0; p1[b + 1] = s.y1 ?? s.y0; p1[b + 2] = s.z1 ?? s.z0; p1[b + 3] = s.sy
    sz[b] = s.sz; sz[b + 1] = s.scaleEnd ?? 1.0; sz[b + 2] = s.yaw ?? 0; sz[b + 3] = s.spin ?? 0
    rt[b] = s.pitch0 ?? 0; rt[b + 1] = s.pitch1 ?? (s.pitch0 ?? 0); rt[b + 2] = s.lut; rt[b + 3] = s.quantSteps ?? 0
    tm[b] = 0; tm[b + 1] = Math.max(0.03, s.dur); tm[b + 2] = s.wireOnly ?? 0; tm[b + 3] = 0
    if (total + 1 > this.peakSolids) this.peakSolids = total + 1
  }

  spawnCloud(c: CloudSpawn): void {
    if (this.disposed || this.profile.tier === 'low') return
    const total = this.totalCloudCount()
    if (total >= this.profile.maxClouds) return
    const pool = c.dark || c.whirlpool ? this.cloudDark : this.cloudAdd
    if (pool.count >= pool.attrA.count) return
    const i = pool.count++
    const b = i * 4
    const aA = pool.attrA.array as Float32Array
    const aB = pool.attrB.array as Float32Array
    const aC = pool.attrC.array as Float32Array
    const aD = pool.attrD.array as Float32Array
    if (c.mode === CloudMode.PlasmaFlow) {
      aA[b] = c.x; aA[b + 1] = c.y; aA[b + 2] = c.z; aA[b + 3] = c.radius
      aB[b] = c.flowStyle ?? 0
      aB[b + 1] = c.erosion ?? 0
      aB[b + 2] = c.spanLen ?? Math.max(1.0, c.radius - 1.6)
      aB[b + 3] = c.endRadius ?? c.radius
      aC[b] = c.height ?? 0; aC[b + 1] = 0; aC[b + 2] = Math.max(0.04, c.dur); aC[b + 3] = c.lut
      aD[b] = c.mode; aD[b + 1] = c.seed ?? Math.random() * 6.283; aD[b + 2] = c.nomWid ?? 1.05; aD[b + 3] = 0
    } else {
      aA[b] = c.x; aA[b + 1] = c.y; aA[b + 2] = c.z; aA[b + 3] = c.radius
      aB[b] = c.vx ?? 0; aB[b + 1] = c.vy ?? 0; aB[b + 2] = c.vz ?? 0; aB[b + 3] = c.endRadius ?? c.radius
      aC[b] = c.height ?? 1.0; aC[b + 1] = 0; aC[b + 2] = Math.max(0.04, c.dur); aC[b + 3] = c.lut
      const flags = c.whirlpool ? 2 : c.dark ? 1 : 0
      aD[b] = c.mode; aD[b + 1] = c.seed ?? Math.random() * 6.283; aD[b + 2] = flags; aD[b + 3] = 0
    }
    if (total + 1 > this.peakClouds) this.peakClouds = total + 1
  }

  clear(): void {
    this.partCount = 0
    this.ribbonCount = 0
    this.waveCount = 0
    this.domeCount = 0
    this.voidCount = 0
    this.decalCount = 0
    this.partGeo.instanceCount = 0
    this.ribbonGeo.instanceCount = 0
    this.waveGeo.instanceCount = 0
    this.domeGeo.instanceCount = 0
    this.domeVoidGeo.instanceCount = 0
    this.decalGeo.instanceCount = 0
    for (const pool of this.solidPools) {
      pool.count = 0
      pool.geo.instanceCount = 0
      pool.mesh.visible = false
    }
    for (const pool of [this.cloudAdd, this.cloudDark]) {
      pool.count = 0
      pool.geo.instanceCount = 0
      pool.mesh.visible = false
    }
    this.renderPassesLastFrame = 0
    if (this.wasBusy && this.isAvailable) {
      this.renderer.setRenderTarget(null)
      this.renderer.clear(true, false, false)
      this.wasBusy = false
    }
  }

  get hasActivePrimitives(): boolean {
    return (
      this.partCount > 0 ||
      this.ribbonCount > 0 ||
      this.waveCount > 0 ||
      this.domeCount > 0 ||
      this.voidCount > 0 ||
      this.decalCount > 0 ||
      this.totalSolidCount() > 0 ||
      this.totalCloudCount() > 0
    )
  }

  step(dt: number, pausedPhysics = false): void {
    if (this.disposed || this.profile.tier === 'low' || pausedPhysics || dt <= 0) return
    this.simTime += dt

    this.decalCount = this.stepVec4Timed(
      this.decalCount,
      this.decalAttrA.array as Float32Array,
      this.decalAttrB.array as Float32Array,
      dt,
    )
    this.waveCount = this.stepWavePool(dt)
    this.domeCount = this.stepDomePool(this.domeCount, this.domePos.array as Float32Array, this.domeMeta.array as Float32Array, dt)
    this.voidCount = this.stepDomePool(this.voidCount, this.domeVoidPos.array as Float32Array, this.domeVoidMeta.array as Float32Array, dt)
    this.ribbonCount = this.stepRibbonPool(dt)
    for (const pool of this.solidPools) pool.count = this.stepSolidPool(pool, dt)
    this.cloudAdd.count = this.stepCloudPool(this.cloudAdd, dt)
    this.cloudDark.count = this.stepCloudPool(this.cloudDark, dt)

    const t = this.simTime * 2.1
    let i = this.partCount - 1
    while (i >= 0) {
      const nextLife = this.plife[i] - dt
      if (nextLife <= 0) {
        const last = --this.partCount
        if (i !== last) this.swapParticle(i, last)
        i--
        continue
      }
      this.plife[i] = nextLife

      let x = this.px[i]
      let y = this.py[i]
      let z = this.pz[i]
      let vx = this.pvx[i]
      let vy = this.pvy[i]
      let vz = this.pvz[i]

      const curl = this.pcurl[i]
      if (curl > 0) {
        const seed = this.pseed[i] * 6.283
        const f = 1.65
        const cx = Math.cos(f * z + t + seed) * Math.sin(f * y + t) - Math.sin(f * y + seed) * Math.cos(f * z + t)
        const cy = Math.cos(f * x + t + seed) * Math.sin(f * z + t) - Math.sin(f * z + seed) * Math.cos(f * x + t)
        const cz = Math.cos(f * y + t + seed) * Math.sin(f * x + t) - Math.sin(f * x + seed) * Math.cos(f * y + t)
        vx += cx * curl * dt
        vy += cy * curl * dt
        vz += cz * curl * dt * 0.7
      }

      const hx = this.phomeX[i]
      if (hx >= 0) {
        const hy = this.phomeY[i]
        const dx = hx - x
        const dy = hy - y
        const dz = 0.28 - z
        const dist = Math.hypot(dx, dy, dz) || 1
        const progress = 1 - nextLife / this.pmax[i]
        const pull = progress * 210
        vx += (dx / dist) * pull * dt
        vy += (dy / dist) * pull * dt
        vz += (dz / dist) * pull * dt * 0.6
        if (dist < 0.24) {
          const last = --this.partCount
          if (i !== last) this.swapParticle(i, last)
          i--
          continue
        }
      }

      const drag = Math.max(0, 1 - this.pdrag[i] * dt)
      vx *= drag
      vy *= drag
      vz = vz * drag + this.pgravZ[i] * dt

      x += vx * dt
      y += vy * dt
      z += vz * dt

      if (z < 0) {
        const bounce = this.pbounce[i]
        if (bounce > 0 && vz < -0.25) {
          z = -z * 0.2
          vz = -vz * bounce
          vx *= 0.8
          vy *= 0.8
        } else {
          z = 0
          if (vz < 0) vz = 0
        }
      }

      this.px[i] = x
      this.py[i] = y
      this.pz[i] = z
      this.pvx[i] = vx
      this.pvy[i] = vy
      this.pvz[i] = vz
      i--
    }
  }

  private swapParticle(dst: number, src: number): void {
    this.px[dst] = this.px[src]
    this.py[dst] = this.py[src]
    this.pz[dst] = this.pz[src]
    this.pvx[dst] = this.pvx[src]
    this.pvy[dst] = this.pvy[src]
    this.pvz[dst] = this.pvz[src]
    this.plife[dst] = this.plife[src]
    this.pmax[dst] = this.pmax[src]
    this.psize[dst] = this.psize[src]
    this.pdrag[dst] = this.pdrag[src]
    this.pgravZ[dst] = this.pgravZ[src]
    this.pcurl[dst] = this.pcurl[src]
    this.pbounce[dst] = this.pbounce[src]
    this.phomeX[dst] = this.phomeX[src]
    this.phomeY[dst] = this.phomeY[src]
    this.plut[dst] = this.plut[src]
    this.pshape[dst] = this.pshape[src]
    this.pseed[dst] = this.pseed[src]
  }

  private stepVec4Timed(count: number, arrA: Float32Array, arrB: Float32Array, dt: number): number {
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = arrB[b] + dt
      if (t >= arrB[b + 1]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          arrA[b] = arrA[lb]; arrA[b + 1] = arrA[lb + 1]; arrA[b + 2] = arrA[lb + 2]; arrA[b + 3] = arrA[lb + 3]
          arrB[b] = arrB[lb]; arrB[b + 1] = arrB[lb + 1]; arrB[b + 2] = arrB[lb + 2]; arrB[b + 3] = arrB[lb + 3]
        }
      } else {
        arrB[b] = t
      }
      i--
    }
    return count
  }

  private stepWavePool(dt: number): number {
    let count = this.waveCount
    const pArr = this.wavePos.array as Float32Array
    const sArr = this.waveShape.array as Float32Array
    const tArr = this.waveTime.array as Float32Array
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = tArr[b] + dt
      if (t >= tArr[b + 1]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          pArr[b] = pArr[lb]; pArr[b + 1] = pArr[lb + 1]; pArr[b + 2] = pArr[lb + 2]; pArr[b + 3] = pArr[lb + 3]
          sArr[b] = sArr[lb]; sArr[b + 1] = sArr[lb + 1]; sArr[b + 2] = sArr[lb + 2]; sArr[b + 3] = sArr[lb + 3]
          tArr[b] = tArr[lb]; tArr[b + 1] = tArr[lb + 1]; tArr[b + 2] = tArr[lb + 2]; tArr[b + 3] = tArr[lb + 3]
        }
      } else {
        tArr[b] = t
      }
      i--
    }
    return count
  }

  private stepDomePool(count: number, pArr: Float32Array, mArr: Float32Array, dt: number): number {
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = mArr[b + 1] + dt
      if (t >= mArr[b + 2]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          pArr[b] = pArr[lb]; pArr[b + 1] = pArr[lb + 1]; pArr[b + 2] = pArr[lb + 2]; pArr[b + 3] = pArr[lb + 3]
          mArr[b] = mArr[lb]; mArr[b + 1] = mArr[lb + 1]; mArr[b + 2] = mArr[lb + 2]; mArr[b + 3] = mArr[lb + 3]
        }
      } else {
        mArr[b + 1] = t
      }
      i--
    }
    return count
  }

  private stepRibbonPool(dt: number): number {
    let count = this.ribbonCount
    const sArr = this.ribbonStart.array as Float32Array
    const cArr = this.ribbonCtrl.array as Float32Array
    const eArr = this.ribbonEnd.array as Float32Array
    const tArr = this.ribbonTime.array as Float32Array
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = tArr[b] + dt
      if (t >= tArr[b + 1]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          sArr[b] = sArr[lb]; sArr[b + 1] = sArr[lb + 1]; sArr[b + 2] = sArr[lb + 2]; sArr[b + 3] = sArr[lb + 3]
          cArr[b] = cArr[lb]; cArr[b + 1] = cArr[lb + 1]; cArr[b + 2] = cArr[lb + 2]; cArr[b + 3] = cArr[lb + 3]
          eArr[b] = eArr[lb]; eArr[b + 1] = eArr[lb + 1]; eArr[b + 2] = eArr[lb + 2]; eArr[b + 3] = eArr[lb + 3]
          tArr[b] = tArr[lb]; tArr[b + 1] = tArr[lb + 1]; tArr[b + 2] = tArr[lb + 2]; tArr[b + 3] = tArr[lb + 3]
        }
      } else {
        tArr[b] = t
      }
      i--
    }
    return count
  }

  private stepSolidPool(pool: VfxWebglEngine['solidPools'][number], dt: number): number {
    let count = pool.count
    const p0 = pool.pos0.array as Float32Array
    const p1 = pool.pos1.array as Float32Array
    const sz = pool.size.array as Float32Array
    const rt = pool.rot.array as Float32Array
    const tm = pool.time.array as Float32Array
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = tm[b] + dt
      if (t >= tm[b + 1]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          p0[b] = p0[lb]; p0[b + 1] = p0[lb + 1]; p0[b + 2] = p0[lb + 2]; p0[b + 3] = p0[lb + 3]
          p1[b] = p1[lb]; p1[b + 1] = p1[lb + 1]; p1[b + 2] = p1[lb + 2]; p1[b + 3] = p1[lb + 3]
          sz[b] = sz[lb]; sz[b + 1] = sz[lb + 1]; sz[b + 2] = sz[lb + 2]; sz[b + 3] = sz[lb + 3]
          rt[b] = rt[lb]; rt[b + 1] = rt[lb + 1]; rt[b + 2] = rt[lb + 2]; rt[b + 3] = rt[lb + 3]
          tm[b] = tm[lb]; tm[b + 1] = tm[lb + 1]; tm[b + 2] = tm[lb + 2]; tm[b + 3] = tm[lb + 3]
        }
      } else {
        tm[b] = t
      }
      i--
    }
    return count
  }

  private stepCloudPool(pool: VfxWebglEngine['cloudAdd'], dt: number): number {
    let count = pool.count
    const aA = pool.attrA.array as Float32Array
    const aB = pool.attrB.array as Float32Array
    const aC = pool.attrC.array as Float32Array
    const aD = pool.attrD.array as Float32Array
    let i = count - 1
    while (i >= 0) {
      const b = i * 4
      const t = aC[b + 1] + dt
      if (t >= aC[b + 2]) {
        const last = --count
        if (i !== last) {
          const lb = last * 4
          aA[b] = aA[lb]; aA[b + 1] = aA[lb + 1]; aA[b + 2] = aA[lb + 2]; aA[b + 3] = aA[lb + 3]
          aB[b] = aB[lb]; aB[b + 1] = aB[lb + 1]; aB[b + 2] = aB[lb + 2]; aB[b + 3] = aB[lb + 3]
          aC[b] = aC[lb]; aC[b + 1] = aC[lb + 1]; aC[b + 2] = aC[lb + 2]; aC[b + 3] = aC[lb + 3]
          aD[b] = aD[lb]; aD[b + 1] = aD[lb + 1]; aD[b + 2] = aD[lb + 2]; aD[b + 3] = aD[lb + 3]
        }
      } else {
        aC[b + 1] = t
      }
      i--
    }
    return count
  }

  render(
    cssWidth: number,
    cssHeight: number,
    dpr: number,
    ox: number,
    oy: number,
    cell: number,
    dtSec: number,
  ): void {
    if (!this.isWebglActive) {
      this.renderPassesLastFrame = 0
      return
    }
    const busy = this.hasActivePrimitives
    this.governor.record(dtSec, busy)

    if (!busy) {
      this.renderPassesLastFrame = 0
      if (this.wasBusy) {
        this.renderer.setRenderTarget(null)
        this.renderer.clear(true, false, false)
        this.wasBusy = false
      }
      return
    }

    this.resize(cssWidth, cssHeight, dpr)
    if (!this.sceneTarget) return

    this.wasBusy = true
    computeObliqueProjection(this.projMatrix.elements, cssWidth, cssHeight, ox, oy, cell)
    this.uCellUniform.value = cell

    this.decalGeo.instanceCount = this.decalCount
    if (this.decalCount > 0) {
      uploadActiveRange(this.decalAttrA, this.decalCount)
      uploadActiveRange(this.decalAttrB, this.decalCount)
    }

    this.ribbonGeo.instanceCount = this.ribbonCount
    if (this.ribbonCount > 0) {
      uploadActiveRange(this.ribbonStart, this.ribbonCount)
      uploadActiveRange(this.ribbonCtrl, this.ribbonCount)
      uploadActiveRange(this.ribbonEnd, this.ribbonCount)
      uploadActiveRange(this.ribbonTime, this.ribbonCount)
    }

    this.waveGeo.instanceCount = this.waveCount
    if (this.waveCount > 0) {
      uploadActiveRange(this.wavePos, this.waveCount)
      uploadActiveRange(this.waveShape, this.waveCount)
      uploadActiveRange(this.waveTime, this.waveCount)
    }

    this.domeGeo.instanceCount = this.domeCount
    if (this.domeCount > 0) {
      uploadActiveRange(this.domePos, this.domeCount)
      uploadActiveRange(this.domeMeta, this.domeCount)
    }

    this.domeVoidGeo.instanceCount = this.voidCount
    if (this.voidCount > 0) {
      uploadActiveRange(this.domeVoidPos, this.voidCount)
      uploadActiveRange(this.domeVoidMeta, this.voidCount)
    }

    this.partGeo.instanceCount = this.partCount
    if (this.partCount > 0) {
      const aA = this.partAttrA.array as Float32Array
      const aB = this.partAttrB.array as Float32Array
      const aC = this.partAttrC.array as Float32Array
      for (let i = 0; i < this.partCount; i++) {
        const b = i * 4
        aA[b] = this.px[i]; aA[b + 1] = this.py[i]; aA[b + 2] = this.pz[i]; aA[b + 3] = this.psize[i]
        aB[b] = this.pvx[i]; aB[b + 1] = this.pvy[i]; aB[b + 2] = this.pvz[i]; aB[b + 3] = this.plife[i] / this.pmax[i]
        aC[b] = this.plut[i]; aC[b + 1] = this.pshape[i]; aC[b + 2] = this.pseed[i]; aC[b + 3] = this.pdrag[i]
      }
      uploadActiveRange(this.partAttrA, this.partCount)
      uploadActiveRange(this.partAttrB, this.partCount)
      uploadActiveRange(this.partAttrC, this.partCount)
    }

    for (const pool of this.solidPools) {
      pool.mesh.visible = pool.count > 0
      pool.geo.instanceCount = pool.count
      if (pool.count > 0) {
        uploadActiveRange(pool.pos0, pool.count)
        uploadActiveRange(pool.pos1, pool.count)
        uploadActiveRange(pool.size, pool.count)
        uploadActiveRange(pool.rot, pool.count)
        uploadActiveRange(pool.time, pool.count)
      }
    }

    for (const pool of [this.cloudAdd, this.cloudDark]) {
      pool.mesh.visible = pool.count > 0
      pool.geo.instanceCount = pool.count
      if (pool.count > 0) {
        uploadActiveRange(pool.attrA, pool.count)
        uploadActiveRange(pool.attrB, pool.count)
        uploadActiveRange(pool.attrC, pool.count)
        uploadActiveRange(pool.attrD, pool.count)
      }
    }

    let passes = 0

    this.renderer.setRenderTarget(this.sceneTarget)
    this.renderer.clear(true, false, false)
    this.renderer.render(this.fxScene, this.dummyCam)
    passes++

    this.postMesh.material = this.threshMat
    this.threshMat.uniforms.tInput.value = this.sceneTarget.texture
    this.threshMat.uniforms.uTexelSize.value.set(1 / Math.max(1, this.sceneTarget.width), 1 / Math.max(1, this.sceneTarget.height))
    this.renderer.setRenderTarget(this.mipDown[0])
    this.renderer.clear(true, false, false)
    this.renderer.render(this.postScene, this.dummyCam)
    passes++

    for (let i = 1; i < this.mipDown.length; i++) {
      const prev = this.mipDown[i - 1]
      const dst = this.mipDown[i]
      this.postMesh.material = this.downMat
      this.downMat.uniforms.tInput.value = prev.texture
      this.downMat.uniforms.uTexelSize.value.set(1 / Math.max(1, prev.width), 1 / Math.max(1, prev.height))
      this.renderer.setRenderTarget(dst)
      this.renderer.clear(true, false, false)
      this.renderer.render(this.postScene, this.dummyCam)
      passes++
    }

    let currentBloom = this.mipDown[this.mipDown.length - 1]
    for (let i = this.mipDown.length - 2; i >= 0; i--) {
      const dst = this.mipUp[i]
      const base = this.mipDown[i]
      this.postMesh.material = this.upMat
      this.upMat.uniforms.tLow.value = currentBloom.texture
      this.upMat.uniforms.tHigh.value = base.texture
      this.upMat.uniforms.uTexelSize.value.set(1 / Math.max(1, currentBloom.width), 1 / Math.max(1, currentBloom.height))
      this.renderer.setRenderTarget(dst)
      this.renderer.clear(true, false, false)
      this.renderer.render(this.postScene, this.dummyCam)
      currentBloom = dst
      passes++
    }

    this.postMesh.material = this.compMat
    this.compMat.uniforms.tScene.value = this.sceneTarget.texture
    this.compMat.uniforms.tBloom.value = currentBloom.texture
    this.renderer.setRenderTarget(null)
    this.renderer.clear(true, false, false)
    this.renderer.render(this.postScene, this.dummyCam)
    passes++

    this.renderPassesLastFrame = passes
    this.totalRenderedFrames++
  }

  stats(): VfxStats {
    return {
      backend: 'webgl2',
      setting: this.setting,
      tier: this.profile.tier,
      hdrFloat: this.hdrFloat,
      contextLost: this.contextLost,
      activeParticles: this.partCount,
      activeRibbons: this.ribbonCount,
      activeWaves: this.waveCount + this.domeCount + this.voidCount,
      activeDecals: this.decalCount,
      activeSolids: this.totalSolidCount(),
      activeClouds: this.totalCloudCount(),
      peakParticles: this.peakParticles,
      peakRibbons: this.peakRibbons,
      peakSolids: this.peakSolids,
      peakClouds: this.peakClouds,
      renderPassesLastFrame: this.renderPassesLastFrame,
      totalRenderedFrames: this.totalRenderedFrames,
      vramBytesApprox: this.targetBytes + this.textureBytes + this.geometryBytes,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubQuality()
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.disposeTargets()
    for (const item of this.disposables) item.dispose()
    this.renderer.dispose()
    this.canvas.remove()
  }

  private createDecalMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec2 aQuad;
      attribute vec4 aDecalA;
      attribute vec4 aDecalB;
      uniform mat4 uProj;
      varying vec2 vUv;
      varying vec2 vBoardPos;
      varying vec4 vMeta;

      void main() {
        float radius = aDecalA.z;
        float rot = aDecalA.w;
        float c = cos(rot), s = sin(rot);
        vec2 local = mat2(c, -s, s, c) * (aQuad * 2.0 * radius);
        vec2 pos2 = aDecalA.xy + local;
        gl_Position = uProj * vec4(pos2, 0.0, 1.0);
        vUv = aQuad + 0.5;
        vBoardPos = pos2;
        vMeta = aDecalB;
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      varying vec2 vUv;
      varying vec2 vBoardPos;
      varying vec4 vMeta;

      void main() {
        float f = clamp(vMeta.x / max(0.001, vMeta.y), 0.0, 1.0);
        float row = vMeta.z;
        float kind = vMeta.w;
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float alpha = 0.0;
        float energy = 0.72;

        vec2 gf = abs(fract(vBoardPos) - 0.5);
        float gridLine = smoothstep(0.435, 0.495, max(gf.x, gf.y));
        float gridCross = smoothstep(0.41, 0.49, gf.x) * smoothstep(0.41, 0.49, gf.y);

        if (kind < 0.5) {
          // 0: Sub-bloom ambient floor light spill illuminating #343434 grid borders
          float falloff = exp(-r * r * 3.2) * smoothstep(1.0, 0.55, r);
          float light = falloff * (0.12 + gridLine * 0.42 + gridCross * 0.34);
          alpha = light * (1.0 - f);
          energy = mix(0.28, 0.50, clamp(falloff * (0.5 + gridLine * 0.5), 0.0, 1.0)) * (1.0 - 0.25 * f);
        } else if (kind < 1.5) {
          // 1: Crisp sub-bloom square grid trace (manhattan / array / probe)
          vec2 edge = abs(p);
          float box = max(edge.x, edge.y);
          float border = smoothstep(0.76, 0.85, box) * smoothstep(0.96, 0.90, box);
          float fill = smoothstep(0.92, 0.82, box) * 0.045;
          alpha = (border * 0.58 + fill) * (1.0 - f);
          energy = mix(0.28, 0.48, border) * (1.0 - 0.2 * f);
        } else if (kind < 2.5) {
          // 2: Sub-bloom Voronoi flood tile crest
          float vor = texture2D(uBrush, vUv * 0.42 + vec2(0.13, f * 0.22)).r;
          float flow = texture2D(uBrush, vUv * 0.65 - vec2(f * 0.18, 0.09)).g;
          vec2 edge = abs(p);
          float box = max(edge.x, edge.y);
          float crest = smoothstep(0.38, 0.08, vor * 0.75 + (1.0 - flow) * 0.25) * smoothstep(0.96, 0.74, box);
          float rim = smoothstep(0.76, 0.86, box) * smoothstep(0.97, 0.90, box);
          alpha = (crest * 0.26 + rim * 0.40 + gridLine * 0.18) * (1.0 - f);
          energy = mix(0.26, 0.46, crest);
        } else {
          // 3: Architectural geometric fracture star & crisp rings on Z = 0
          float ang = atan(p.y, p.x);
          float rays = pow(abs(cos(ang * 4.0)), 6.0);
          float ringA = smoothstep(0.10, 0.0, abs(r - (0.22 + 0.62 * f)));
          float ringB = smoothstep(0.07, 0.0, abs(r - (0.1 + 0.42 * f)));
          float center = exp(-r * r * 7.5);
          alpha = (rays * (1.0 - r) * 0.52 + ringA * 0.62 + ringB * 0.42 + center * 0.28 + gridCross * (1.0 - r) * 0.32) * (1.0 - f);
          energy = clamp(0.40 + center * 0.26 + ringA * 0.24, 0.1, 0.82);
        }

        if (alpha <= 0.002) discard;
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      AdditiveBlending,
    )
  }

  private createRibbonMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec2 aStrip;
      attribute vec4 aRibStart;
      attribute vec4 aRibCtrl;
      attribute vec4 aRibEnd;
      attribute vec4 aRibTime;

      uniform mat4 uProj;
      uniform vec2 uResolution;
      uniform float uCell;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying float vProgress;
      varying float vSpin;

      vec3 evalBezier(vec3 a, vec3 c, vec3 b, float u) {
        float iu = 1.0 - u;
        return iu * iu * a + 2.0 * iu * u * c + u * u * b;
      }

      vec3 evalTangent(vec3 a, vec3 c, vec3 b, float u) {
        return 2.0 * (1.0 - u) * (c - a) + 2.0 * u * (b - c);
      }

      void main() {
        float u = aStrip.x;
        float side = aStrip.y;
        float t = aRibTime.x;
        float dur = max(0.001, aRibTime.y);
        float f = clamp(t / dur, 0.0, 1.0);
        float seed = aRibTime.z;
        float spin = aRibTime.w;
        float style = aRibEnd.w;

        vec3 A = aRibStart.xyz;
        vec3 C = aRibCtrl.xyz;
        vec3 B = aRibEnd.xyz;
        vec3 pos = evalBezier(A, C, B, u);
        vec3 tan3 = evalTangent(A, C, B, u);
        if (dot(tan3, tan3) < 1e-6) tan3 = vec3(1.0, 0.0, 0.0);
        vec2 perp3 = normalize(vec2(-tan3.y, tan3.x) + vec2(1e-4));

        if (style > 2.5 && style < 3.5) {
          float env = sin(u * 3.1415926);
          float j = sin(u * 28.0 + seed + t * 44.0) * 0.55 + cos(u * 53.0 - t * 68.0) * 0.45;
          pos.z += j * env * 0.48;
          pos.xy += perp3 * j * env * 0.28;
        } else if (style > 6.5 && style < 7.5) {
          float tri = abs(fract(u * 9.0 + seed) * 4.0 - 2.0) - 1.0;
          float tri2 = abs(fract(u * 19.0 + seed * 1.7) * 4.0 - 2.0) - 1.0;
          float wave = tri * 0.72 + tri2 * 0.28;
          float ramp = smoothstep(0.08, 0.72, u) * smoothstep(1.0, 0.92, u);
          pos.z += max(0.0, wave) * ramp * 0.95;
          pos.xy += perp3 * wave * ramp * 0.46;
        } else if (style > 8.5 && style < 9.5) {
          float env = sin(u * 3.1415926);
          float w1 = sin(u * 11.0 - t * 14.0 + seed);
          float w2 = cos(u * 19.0 - t * 22.0 + seed * 1.7);
          float sw = w1 * 0.64 + w2 * 0.36;
          pos.z += (0.14 + sw * 0.34) * env;
          pos.xy += perp3 * sw * env * 0.25;
        } else if (style > 9.5) {
          pos.z += 0.08 * sin(u * 3.1415926);
        } else if (style > 7.5) {
          float env = sin(u * 3.1415926);
          float sw = sin(u * 9.4247 + seed - f * 7.2) * 0.65 + cos(u * 15.7 + seed * 0.6 + f * 4.5) * 0.35;
          pos.z += sw * env * 0.38;
          pos.xy += perp3 * sw * env * 0.24;
        }

        vec4 clipP = uProj * vec4(pos, 1.0);
        vec4 clipQ = uProj * vec4(pos + normalize(tan3) * 0.08, 1.0);
        float invWP = 1.0 / max(0.05, clipP.w);
        float invWQ = 1.0 / max(0.05, clipQ.w);
        vec2 ndcP = clipP.xy * invWP;
        vec2 ndcQ = clipQ.xy * invWQ;
        float aspect = uResolution.x / max(1.0, uResolution.y);
        vec2 d = (ndcQ - ndcP) * vec2(aspect, 1.0);
        if (dot(d, d) < 1e-8) d = vec2(1.0, 0.0);
        vec2 dir = normalize(d);
        vec2 perp = vec2(-dir.y / aspect, dir.x);

        float widthCells = aRibStart.w;
        float taper = 1.0;
        if (style < 0.5) {
          taper = (1.0 - 0.5 * f) * (0.28 + 0.72 * sin(min(1.0, u * 6.0) * 1.5708) * sin(min(1.0, (1.0 - u) * 6.0) * 1.5708));
        } else if (style < 1.5) {
          taper = sin(u * 3.1415926) * (1.0 - 0.3 * f);
        } else if (style < 2.5) {
          taper = smoothstep(0.0, 0.88, u) * (1.0 - 0.42 * f);
        } else if (style < 3.5) {
          taper = (0.35 + 0.65 * sin(u * 3.1415926)) * (1.0 - f);
        } else if (style < 5.5) {
          taper = 1.0 - 0.32 * f;
        } else if (style < 6.5) {
          taper = 1.0 - 0.22 * f;
        } else if (style < 7.5) {
          taper = (0.55 + 0.45 * smoothstep(0.0, 0.4, u)) * (1.0 - 0.3 * f);
        } else if (style < 8.5) {
          taper = (0.35 + 0.65 * sin(min(1.0, u * 4.0) * 1.5708) * sin(min(1.0, (1.0 - u) * 4.0) * 1.5708)) * (1.0 - 0.35 * f);
        } else if (style < 9.5) {
          float headTap = sin(min(1.0, u * 5.0) * 1.5708);
          float tailTap = pow(sin(min(1.0, (1.0 - u) * 3.5) * 1.5708), 0.75);
          taper = (0.28 + 0.72 * headTap * tailTap) * (1.0 - 0.28 * f);
        } else {
          taper = (0.80 + 0.20 * sin(u * 3.1415926)) * (1.0 - 0.16 * f);
        }

        float ndcPerCell = (2.0 * uCell) / max(1.0, uResolution.y);
        vec2 offset = perp * (side * 0.5 * widthCells * taper * ndcPerCell);
        gl_Position = vec4(clipP.xy + offset, clipP.z, clipP.w);
        vUv = vec2(u, side * 0.5 + 0.5);
        vMeta = vec4(f, aRibCtrl.w, style, seed);
        vProgress = f;
        vSpin = spin;
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      varying vec2 vUv;
      varying vec4 vMeta;
      varying float vProgress;
      varying float vSpin;

      void main() {
        float f = vProgress;
        float row = vMeta.y;
        float style = vMeta.z;
        float seed = vMeta.w;
        float across = abs(vUv.y * 2.0 - 1.0);

        if (style > 3.5 && style < 4.5) {
          float line = exp(-across * across * 24.0);
          float tick = vSpin >= 1.5
            ? smoothstep(0.11, 0.015, abs(fract(vUv.x * vSpin) - 0.5)) * smoothstep(0.96, 0.28, across)
            : 0.0;
          float head = clamp(f * 3.8, 0.0, 1.0);
          float vis = smoothstep(head + 0.04, head - 0.06, vUv.x) * smoothstep(1.0, 0.14, f);
          float alpha = clamp((line + tick * 0.85) * vis, 0.0, 1.0);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.66 + line * 0.32, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 4.5 && style < 5.5) {
          float rail = exp(-pow((across - 0.58) / 0.16, 2.0));
          float alpha = clamp(rail * 1.25 * smoothstep(1.0, 0.08, f), 0.0, 1.0);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.72 + rail * 0.27, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 5.5 && style < 6.5) {
          float dash = step(0.42, fract(vUv.x * 7.0 + f * 4.6));
          float bar = smoothstep(0.92, 0.42, across);
          float alpha = clamp(dash * bar * smoothstep(1.0, 0.12, f), 0.0, 1.0);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.62 + bar * 0.34, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 6.5 && style < 7.5) {
          float trace = exp(-across * across * 14.0);
          float head = clamp(f * 2.4, 0.0, 1.0);
          float vis = smoothstep(head + 0.05, head - 0.08, vUv.x) * smoothstep(1.0, 0.16, f);
          float alpha = clamp(trace * 1.2 * vis, 0.0, 1.0);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.72 + trace * 0.27, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 9.5) {
          float lanePos = clamp(vUv.y, 0.0, 0.999) * 5.0;
          float laneIdx = floor(lanePos);
          float laneSub = abs(fract(lanePos) - 0.5) * 2.0;
          float laneCore = smoothstep(0.82, 0.22, laneSub);
          float laneSpeed = 6.0 + mod(laneIdx, 3.0) * 2.4;
          float rawBit = texture2D(uBrush, vec2(vUv.x * 2.4 - f * laneSpeed + seed + laneIdx * 0.23, 0.18 + laneIdx * 0.17)).r;
          float cell = fract(vUv.x * (12.0 + mod(laneIdx, 2.0) * 4.0) - f * 20.0 + laneIdx * 0.37);
          float block = smoothstep(0.16, 0.26, cell) * smoothstep(0.88, 0.76, cell) * step(0.44, rawBit);
          float lead = smoothstep(0.62, 0.84, cell) * block;
          float strobe = 0.48 + 0.52 * step(0.34, fract(f * 19.0 + laneIdx * 0.21 + floor(vUv.x * 10.0) * 0.13));
          float rail = exp(-pow((across - 0.90) / 0.085, 2.0));
          float head = clamp(f * 3.6, 0.0, 1.0);
          float vis = smoothstep(head + 0.04, head - 0.09, vUv.x) * smoothstep(1.0, 0.16, f);
          float alpha = clamp((block * laneCore * (0.42 + 0.36 * strobe) + rail * 0.50) * vis, 0.0, 0.62);
          if (alpha <= 0.002) discard;
          float baseHue = mod(laneIdx, 2.0) < 0.5 ? 0.62 : 0.33;
          float energy = clamp(baseHue + lead * 0.16 * strobe + rail * 0.08 - 0.10 * f, 0.20, 0.78);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 8.5) {
          float s1 = texture2D(uBrush, vec2(vUv.x * 2.1 - f * 2.6 + seed, vUv.y * 1.35 + sin(vUv.x * 6.0 - f * 8.0) * 0.14)).b;
          float s2 = texture2D(uBrush, vec2(vUv.x * 3.4 - f * 3.8 + seed * 0.7, vUv.y * 2.1 - f * 0.9)).g;
          float flameNoise = s1 * 0.64 + s2 * 0.36;
          float profile = exp(-across * across * 2.15);
          float field = profile * (0.42 + 0.85 * flameNoise) - f * 0.24 - 0.14 * across;
          float body = smoothstep(0.16, 0.44, field);
          float rim = smoothstep(0.14, 0.24, field) - smoothstep(0.24, 0.40, field);
          float spine = exp(-across * across * 16.0) * smoothstep(0.22, 0.56, flameNoise);
          float head = clamp(f * 2.25, 0.0, 1.0);
          float reveal = smoothstep(head + 0.06, head - 0.18, vUv.x) * smoothstep(1.0, 0.16, f);
          float alpha = clamp((body * 0.40 + rim * 0.76 + spine * 0.48) * reveal, 0.0, 0.66);
          if (alpha <= 0.002) discard;
          float energy = clamp(0.36 + rim * 0.48 + spine * 0.36 - 0.14 * f, 0.15, 0.94);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (style >= 7.5) {
          float mistNoise = texture2D(uBrush, vec2(vUv.x * 1.6 - f * 1.5 + seed, vUv.y * 1.4 + f * 0.4)).g;
          float fbm = texture2D(uBrush, vec2(vUv.x * 3.1 + seed, vUv.y * 2.2 - f * 0.8)).b;
          float soft = exp(-across * across * 2.4) * (0.45 + 0.72 * mistNoise * 0.65 + 0.35 * fbm);
          float head = clamp(f * 1.65, 0.0, 1.0);
          float reveal = smoothstep(head + 0.08, head - 0.22, vUv.x) * smoothstep(1.0, 0.14, f);
          float alpha = clamp(soft * reveal * 0.46, 0.0, 0.52);
          if (alpha <= 0.002) discard;
          float glow = exp(-across * across * 7.5);
          vec4 col = sampleLut(row, clamp(0.34 + glow * 0.42 * (1.0 - 0.3 * f), 0.12, 0.88));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        float streak = texture2D(uBrush, vec2(vUv.x * 2.2 - f * 2.0 + seed, vUv.y * 1.4)).b;
        float grain = texture2D(uBrush, vec2(vUv.x * 1.5 + seed, vUv.y * 2.0)).g;

        float core = exp(-across * across * 18.0);
        float sheath = smoothstep(1.0, 0.18, across + (1.0 - streak) * (0.28 + 0.5 * f));
        float reveal = 1.0;
        if (style > 0.5 && style < 1.5) {
          float head = clamp(f * 2.4, 0.0, 1.0);
          float tail = clamp((f - 0.28) * 1.4, 0.0, 1.0);
          reveal = smoothstep(head + 0.05, head - 0.12, vUv.x) * smoothstep(tail - 0.15, tail + 0.25, vUv.x) * (1.0 - f * 0.65);
        } else if (style >= 1.5 && style < 2.5) {
          float head = clamp(f * 1.3, 0.0, 1.0);
          reveal = smoothstep(head + 0.05, head - 0.16, vUv.x) * smoothstep(head - 0.78, head, vUv.x);
        } else {
          reveal = smoothstep(1.0, 0.12, f);
        }

        float erode = smoothstep(0.0, 0.42, sheath * (0.7 + 0.3 * grain) - f * 0.28);
        float alpha = clamp((core * 1.15 + sheath * 0.68) * erode * reveal, 0.0, 1.0);
        if (alpha <= 0.002) discard;

        float energy = clamp(core * 0.8 + 0.45 * (1.0 - f), 0.15, 0.99);
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uResolution: this.uResUniform,
        uCell: this.uCellUniform,
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      AdditiveBlending,
    )
  }

  private createWaveMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec2 aRing;
      attribute vec4 aWavePos;
      attribute vec4 aWaveShape;
      attribute vec4 aWaveTime;

      uniform mat4 uProj;
      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        float u = aRing.x;
        float edge = aRing.y;
        float f = clamp(aWaveTime.x / max(0.001, aWaveTime.y), 0.0, 1.0);
        float ease = 1.0 - pow(1.0 - f, 3.0);
        float mode = aWaveTime.w;
        float spin = (mode > 0.5 && mode < 1.5) ? f * 4.2 : f * 0.95;
        float theta = u * 6.2831853 + spin;

        float rBase = mix(aWaveShape.x, aWaveShape.y, ease) + edge * aWaveTime.z * (1.0 - 0.4 * f);
        float modR = mode > 2.5
          ? 1.0 + 0.15 * cos(theta * 4.0 + f * 7.2) + 0.08 * sin(theta * 7.0 - f * 5.2)
          : 1.0;
        float r = max(0.02, rBase * modR);
        float zWave = mode > 2.5
          ? 0.28 * sin(theta * 5.0 + f * 7.8) * (1.0 - 0.45 * f)
          : 0.0;
        vec3 local = vec3(cos(theta) * r, sin(theta) * r, edge * aWaveTime.z * 0.85 + zWave);

        float pitchX = aWaveShape.z;
        float rollY = aWaveShape.w;
        float cp = cos(pitchX), sp = sin(pitchX);
        float cr = cos(rollY), sr = sin(rollY);
        vec3 r1 = vec3(local.x * cr + local.z * sr, local.y, -local.x * sr + local.z * cr);
        vec3 r2 = vec3(r1.x, r1.y * cp - r1.z * sp, r1.y * sp + r1.z * cp);

        vec3 world = aWavePos.xyz + r2;
        gl_Position = uProj * vec4(world, 1.0);
        vUv = vec2(u, edge + 0.5);
        vMeta = vec4(f, aWavePos.w, mode, aWavePos.z);
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      varying vec2 vUv;
      varying vec4 vMeta;

      void main() {
        float f = vMeta.x;
        float row = vMeta.y;
        float mode = vMeta.z;
        float radial = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float mask = pow(radial, 1.35);

        if (mode > 2.5) {
          float band = abs(sin(radial * 6.2832));
          float fold = 0.74 + 0.26 * cos(vUv.x * 25.1327 + f * 6.283);
          mask = (pow(radial, 1.25) * 0.34 + smoothstep(0.42, 0.90, band) * 0.74) * fold;
        } else if (mode > 0.5 && mode < 1.5) {
          float fineTicks = step(0.32, fract(vUv.x * 24.0));
          float cardinals = smoothstep(0.12, 0.02, abs(fract(vUv.x * 4.0) - 0.5));
          mask *= max(fineTicks * 0.55, cardinals);
        } else if (mode >= 1.5) {
          mask = pow(radial, 0.75);
        } else {
          float brush = texture2D(uBrush, vec2(vUv.x * 4.0 + f * 0.45, vUv.y)).g;
          mask *= smoothstep(0.04, 0.52, brush + radial * 0.48 - f * 0.42);
        }

        float bgWave = step(vMeta.w, 0.08);
        float alpha = mask * (1.0 - f) * (mode > 2.5 ? 0.78 : 0.88) * mix(1.0, 0.44, bgWave);
        if (alpha <= 0.002) discard;
        float energy = bgWave > 0.5
          ? clamp(0.34 + radial * 0.30 - 0.16 * f, 0.16, 0.66)
          : clamp(0.48 + radial * 0.5 - 0.3 * f, 0.1, 0.99);
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      AdditiveBlending,
    )
  }

  private createDomeMaterial(isVoid: boolean): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec4 aDomePos;
      attribute vec4 aDomeMeta;

      uniform mat4 uProj;
      varying vec3 vNormal;
      varying vec4 vMeta;

      void main() {
        float f = clamp(aDomeMeta.y / max(0.001, aDomeMeta.z), 0.0, 1.0);
        float ease = 1.0 - pow(1.0 - f, 2.2);
        float radius = mix(aDomePos.w, aDomeMeta.x, ease);
        vec3 world = aDomePos.xyz + position * radius;
        gl_Position = uProj * vec4(world, 1.0);
        vNormal = normalize(position);
        vMeta = vec4(f, aDomeMeta.w, 0.0, 0.0);
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      uniform float uIsVoid;
      varying vec3 vNormal;
      varying vec4 vMeta;

      void main() {
        float f = vMeta.x;
        float row = vMeta.y;
        vec3 viewDir = normalize(vec3(0.0, 0.46, 0.89));
        float ndotv = abs(dot(normalize(vNormal), viewDir));
        float fresnel = pow(1.0 - ndotv, 2.2);
        float noise = texture2D(uBrush, vNormal.xy * 1.4 + vec2(f * 0.5)).g;

        if (uIsVoid > 0.5) {
          float coreAlpha = smoothstep(0.16, 0.54, ndotv) * (0.95 - 0.25 * f);
          float rim = pow(1.0 - ndotv, 2.8) * (1.0 - f * 0.35);
          vec4 rimCol = sampleLut(row, clamp(0.62 + 0.38 * rim, 0.1, 0.99));
          float finalAlpha = clamp(coreAlpha + rim * 0.95, 0.0, 0.96);
          if (finalAlpha <= 0.003) discard;
          gl_FragColor = vec4(rimCol.rgb * rim * 1.25, finalAlpha);
          return;
        }

        float alpha = (fresnel * 0.92 + 0.14 * noise) * (1.0 - f);
        if (alpha <= 0.003) discard;
        float energy = clamp(0.38 + fresnel * 0.6, 0.1, 0.99);
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uIsVoid: { value: isVoid ? 1.0 : 0.0 },
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      isVoid ? NormalBlending : AdditiveBlending,
    )
  }

  private createParticleMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec2 aQuad;
      attribute vec4 aInstA;
      attribute vec4 aInstB;
      attribute vec4 aInstC;

      uniform mat4 uProj;
      uniform vec2 uResolution;
      uniform float uCell;

      varying vec2 vQuad;
      varying float vLife;
      varying vec3 vMeta;

      void main() {
        vec3 world = aInstA.xyz;
        float sizePx = aInstA.w;
        vec3 vel = aInstB.xyz;
        float lifeFrac = aInstB.w;
        float lutRow = aInstC.x;
        float shape = aInstC.y;
        float seed = aInstC.z;

        vec4 centerClip = uProj * vec4(world, 1.0);
        float wSafe = max(0.08, centerClip.w);
        float pxToNdcY = 2.0 / max(1.0, uResolution.y);
        float aspect = uResolution.x / max(1.0, uResolution.y);
        float scale = clamp(1.0 / wSafe, 0.65, 3.0);

        vec2 dir = vec2(1.0, 0.0);
        float stretch = 1.0;

        if (shape < 0.5 || (shape > 3.5 && shape < 4.5)) {
          vec4 tipClip = uProj * vec4(world + vel * 0.055, 1.0);
          vec2 delta = (tipClip.xy / max(0.08, tipClip.w) - centerClip.xy / wSafe) * vec2(aspect, 1.0);
          float len = length(delta);
          if (len > 1e-4) {
            dir = delta / len;
            float speedCells = length(vel);
            stretch = shape < 0.5 ? clamp(1.8 + speedCells * 0.7, 1.8, 9.0) : clamp(1.1 + speedCells * 0.18, 1.1, 2.2);
          }
        } else if (shape > 5.5) {
          vec4 tipClip = uProj * vec4(world + vel * 0.05, 1.0);
          vec2 delta = (tipClip.xy / max(0.08, tipClip.w) - centerClip.xy / wSafe) * vec2(aspect, 1.0);
          float baseAng = length(delta) > 1e-4 ? atan(delta.y, delta.x) : seed * 6.2831853;
          float ang = baseAng + (seed - 0.5) * 1.3 + (1.0 - lifeFrac) * (seed > 0.5 ? 3.2 : -3.2);
          dir = vec2(cos(ang), sin(ang));
        } else {
          float spinSpeed = shape > 4.5 ? 6.2 : shape > 1.5 ? 7.5 : 1.8;
          float ang = seed * 6.2831853 + (1.0 - lifeFrac) * spinSpeed;
          dir = vec2(cos(ang), sin(ang));
        }

        vec2 perp = vec2(-dir.y, dir.x);
        float radiusPx = max(1.3, sizePx * (0.55 + 0.55 * lifeFrac) * (uCell / 36.0) * scale);
        vec2 localPx = dir * (aQuad.x * radiusPx * 2.0 * stretch) + perp * (aQuad.y * radiusPx * 2.0);
        vec2 offsetNdc = vec2(localPx.x / aspect, localPx.y) * pxToNdcY;

        gl_Position = vec4(centerClip.xy + offsetNdc * centerClip.w, centerClip.z, centerClip.w);
        vQuad = aQuad * 2.0;
        vLife = lifeFrac;
        vMeta = vec3(lutRow, shape, seed);
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      varying vec2 vQuad;
      varying float vLife;
      varying vec3 vMeta;

      void main() {
        float row = vMeta.x;
        float shape = vMeta.y;
        float seed = vMeta.z;
        float r2 = dot(vQuad, vQuad);

        if (shape > 5.5) {
          vec2 q = vec2(vQuad.y, vQuad.x);
          float k = 1.7320508;
          float rTri = 0.82;
          q.x = abs(q.x) - rTri;
          q.y = q.y + rTri / k;
          if (q.x + k * q.y > 0.0) q = vec2(q.x - k * q.y, -k * q.x - q.y) * 0.5;
          q.x -= clamp(q.x, -2.0 * rTri, 0.0);
          float sd = -length(q) * sign(q.y);
          if (sd > 0.04) discard;
          float fill = smoothstep(0.04, -0.06, sd) * 0.36;
          float border = smoothstep(0.18, 0.03, abs(sd + 0.05)) * 0.92;
          float alpha = (fill + border) * clamp(vLife * 1.75, 0.0, 1.0);
          if (alpha <= 0.003) discard;
          float energy = clamp(0.54 + border * 0.36, 0.15, 0.90);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (shape > 4.5) {
          float box = max(abs(vQuad.x) * 1.15, abs(vQuad.y) * 0.78);
          if (box > 0.92) discard;
          float edge = smoothstep(0.92, 0.74, box);
          float bevel = smoothstep(0.56, 0.16, box);
          float alpha = edge * clamp(vLife * 1.7, 0.0, 1.0);
          vec4 col = sampleLut(row, clamp(0.56 + bevel * 0.4, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (shape > 3.5) {
          if (r2 > 1.0) discard;
          float d = sqrt(r2);
          float rim = pow(d, 2.2) * smoothstep(1.0, 0.78, d);
          vec2 specD = vQuad - vec2(-0.28, -0.32);
          float glint = exp(-dot(specD, specD) * 16.0);
          float body = smoothstep(1.0, 0.45, d) * 0.35;
          float alpha = (rim * 0.9 + glint * 1.2 + body) * clamp(vLife * 1.6, 0.0, 1.0);
          if (alpha <= 0.003) discard;
          float energy = clamp(0.54 + glint * 0.45 + rim * 0.25, 0.1, 0.99);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (shape > 2.5) {
          float box = max(abs(vQuad.x), abs(vQuad.y));
          if (box > 0.85) discard;
          float edge = smoothstep(0.85, 0.65, box);
          float alpha = edge * clamp(vLife * 1.4, 0.0, 1.0) * 0.88;
          gl_FragColor = vec4(vec3(0.45, 0.43, 0.4) * alpha * uSceneGain, alpha * 0.6);
          return;
        }

        if (shape > 1.5) {
          float man = abs(vQuad.x) + abs(vQuad.y);
          if (man > 0.95) discard;
          float edge = smoothstep(0.95, 0.7, man);
          float bevel = smoothstep(0.48, 0.0, man);
          float alpha = edge * clamp(vLife * 1.8, 0.0, 1.0);
          float energy = clamp(0.58 + bevel * 0.42, 0.1, 0.99);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (shape > 0.5) {
          if (r2 > 1.0) discard;
          float radial = 1.0 - sqrt(r2);
          float brush = texture2D(uBrush, vQuad * 0.42 + vec2(seed, 1.0 - vLife * 0.4)).g;
          float erode = smoothstep(0.02, 0.46, radial * (0.58 + 0.42 * brush) - (1.0 - vLife) * 0.24);
          if (erode <= 0.004) discard;
          float energy = clamp(radial * 0.65 + vLife * 0.35, 0.1, 0.99);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * erode, 0.0);
          return;
        }

        if (r2 > 1.0) discard;
        float core = exp(-vQuad.y * vQuad.y * 4.8) * smoothstep(1.0, 0.08, abs(vQuad.x));
        float tip = smoothstep(-0.85, 0.5, vQuad.x);
        float alpha = core * (0.5 + 0.5 * tip) * clamp(vLife * 1.7, 0.0, 1.0);
        if (alpha <= 0.003) discard;
        float energy = clamp(0.44 + core * 0.42 + tip * 0.14, 0.1, 0.99);
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uResolution: this.uResUniform,
        uCell: this.uCellUniform,
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      AdditiveBlending,
    )
  }

  private createSolidMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec4 aEdge;
      attribute vec4 aSolPos0;
      attribute vec4 aSolPos1;
      attribute vec4 aSolSize;
      attribute vec4 aSolRot;
      attribute vec4 aSolTime;

      uniform mat4 uProj;
      varying vec3 vNormal;
      varying vec4 vEdge;
      varying vec4 vMeta;

      void main() {
        float t = aSolTime.x;
        float dur = max(0.001, aSolTime.y);
        float f = clamp(t / dur, 0.0, 1.0);
        float quant = aSolRot.w;
        float uMotion = (quant >= 1.5)
          ? floor(min(0.999, f) * quant) / max(1.0, quant - 1.0)
          : (1.0 - pow(1.0 - f, 2.4));

        vec3 center = mix(aSolPos0.xyz, aSolPos1.xyz, uMotion);
        float sc = mix(1.0, aSolSize.y, 1.0 - pow(1.0 - f, 2.2));
        vec3 scale3 = vec3(aSolPos0.w, aSolPos1.w, aSolSize.x) * sc;
        vec3 local = position * scale3;
        vec3 nLocal = normal / max(vec3(0.01), scale3);

        float pitch = mix(aSolRot.x, aSolRot.y, 1.0 - pow(1.0 - f, 2.4));
        float cp = cos(pitch), sp = sin(pitch);
        vec3 p1 = vec3(local.x * cp + local.z * sp, local.y, -local.x * sp + local.z * cp);
        vec3 n1 = vec3(nLocal.x * cp + nLocal.z * sp, nLocal.y, -nLocal.x * sp + nLocal.z * cp);

        float yaw = aSolSize.z + aSolSize.w * t;
        float cy = cos(yaw), sy = sin(yaw);
        vec3 p2 = vec3(p1.x * cy - p1.y * sy, p1.x * sy + p1.y * cy, p1.z);
        vec3 n2 = vec3(n1.x * cy - n1.y * sy, n1.x * sy + n1.y * cy, n1.z);

        vec3 world = center + p2;
        world.z = max(0.01, world.z);
        gl_Position = uProj * vec4(world, 1.0);
        vNormal = normalize(n2);
        vEdge = aEdge;
        vMeta = vec4(f, aSolRot.z, aSolTime.z, quant);
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      varying vec3 vNormal;
      varying vec4 vEdge;
      varying vec4 vMeta;

      void main() {
        float f = vMeta.x;
        float row = vMeta.y;
        float wireOnly = vMeta.z;
        float quant = vMeta.w;

        if (vEdge.w > 2.5) {
          float ndotv = abs(dot(normalize(vNormal), normalize(vec3(0.0, 0.42, 0.91))));
          float core = pow(ndotv, 2.0);
          float rim = pow(1.0 - ndotv, 1.85);
          float pulse = 0.84 + 0.16 * sin(f * 26.0);
          float fade = smoothstep(1.0, 0.12, f);
          float alpha = clamp((core * 0.64 + rim * 0.94) * pulse * fade, 0.0, 0.95);
          if (alpha <= 0.003) discard;
          float energy = clamp(0.46 + core * 0.42 + rim * 0.24 - 0.12 * f, 0.15, 0.96);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (vEdge.w > 1.5) {
          vec2 g = abs(fract(vEdge.xy * 4.0) - 0.5);
          float grid = smoothstep(0.08, 0.01, min(g.x, g.y));
          float border = smoothstep(0.06, 0.01, min(min(vEdge.x, 1.0 - vEdge.x), min(vEdge.y, 1.0 - vEdge.y)));
          float bar = exp(-pow((vEdge.y - fract(f * 3.0)) * 14.0, 2.0));
          float alpha = clamp((grid * 0.36 + border * 0.92 + bar * 0.95) * smoothstep(1.0, 0.14, f), 0.0, 1.0);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.55 + bar * 0.42, 0.1, 0.99));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        float edgeDist = (vEdge.w > 0.5)
          ? min(min(vEdge.x, 1.0 - vEdge.x), min(vEdge.y, 1.0 - vEdge.y))
          : min(min(vEdge.x, vEdge.y), vEdge.z) * 1.5;
        float edgeMask = smoothstep(0.09, 0.012, edgeDist);
        float shade = 0.34 + 0.66 * abs(dot(normalize(vNormal), normalize(vec3(0.45, -0.55, 0.72))));
        float fillAlpha = (1.0 - wireOnly) * shade * 0.58;
        float fade = (quant >= 1.5) ? (1.0 - f * 0.32) : smoothstep(1.0, 0.14, f);
        float alpha = clamp((fillAlpha + edgeMask * 0.96) * fade, 0.0, 1.0);
        if (alpha <= 0.002) discard;

        float energy = clamp(0.42 + shade * 0.25 + edgeMask * 0.35 - f * 0.18, 0.12, 0.99);
        vec4 col = sampleLut(row, energy);
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      AdditiveBlending,
    )
  }

  private createCloudMaterial(isDark: boolean): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      attribute vec2 aQuad;
      attribute vec4 aCloudA;
      attribute vec4 aCloudB;
      attribute vec4 aCloudC;
      attribute vec4 aCloudD;

      uniform mat4 uProj;
      uniform vec2 uResolution;
      uniform float uCell;

      varying vec2 vUv;
      varying vec4 vMeta;
      varying float vSeed;
      varying float vFlags;
      varying vec4 vFlowCoord;
      varying vec4 vFlowParams;

      void main() {
        float t = aCloudC.y;
        float dur = max(0.001, aCloudC.z);
        float f = clamp(t / dur, 0.0, 1.0);
        float lutRow = aCloudC.w;
        float mode = aCloudD.x;
        float seed = aCloudD.y;
        float flags = aCloudD.z;

        float r0 = aCloudA.w;
        float r1 = aCloudB.w;
        float ease = 1.0 - pow(1.0 - f, 2.2);
        float r = mix(r0, r1, ease);
        vec3 world = aCloudA.xyz + aCloudB.xyz * (t * (1.0 - 0.32 * f));

        vFlowCoord = vec4(0.0);
        vFlowParams = vec4(1.0, 1.0, 0.0, 0.0);

        if (mode >= 4.5) {
          float ang = aCloudC.x;
          float ca = cos(ang), sa = sin(ang);
          float grow = 0.78 + 0.22 * (1.0 - pow(1.0 - f, 3.0));
          vec2 local = vec2(aQuad.x * 2.0 * r0, aQuad.y * 2.0 * r1);
          vec2 rot = vec2(local.x * ca - local.y * sa, local.x * sa + local.y * ca);
          vec2 worldXY = aCloudA.xy + rot;
          gl_Position = uProj * vec4(worldXY, max(0.02, aCloudA.z), 1.0);
          vFlowCoord = vec4(local / grow, worldXY);
          vFlowParams = vec4(max(0.6, aCloudB.z), max(0.35, aCloudD.z), aCloudB.x, aCloudB.y);
        } else if (mode >= 1.5) {
          vec3 p3 = vec3(world.xy + aQuad * 2.0 * r, max(0.02, world.z));
          gl_Position = uProj * vec4(p3, 1.0);
        } else if (mode >= 0.5) {
          float yNorm = aQuad.y + 0.5;
          float curH = aCloudC.x * ease;
          float twist = sin(yNorm * 8.5 - f * 10.0 + seed) * 0.3 * yNorm;
          float wSpread = r * (0.45 + 0.95 * yNorm);
          vec3 p3 = vec3(world.x + aQuad.x * wSpread + twist, world.y + twist * 0.45, max(0.02, world.z + yNorm * curH));
          gl_Position = uProj * vec4(p3, 1.0);
        } else {
          vec4 centerClip = uProj * vec4(world, 1.0);
          float wSafe = max(0.08, centerClip.w);
          float scale = clamp(1.0 / wSafe, 0.65, 3.0);
          float aspect = uResolution.x / max(1.0, uResolution.y);
          float ndcPerCell = (2.0 * uCell) / max(1.0, uResolution.y);
          vec2 offset = vec2(aQuad.x * 2.0 * r * scale / aspect, aQuad.y * 2.0 * r * scale) * ndcPerCell;
          gl_Position = vec4(centerClip.xy + offset * centerClip.w, centerClip.z, centerClip.w);
        }

        vUv = aQuad + 0.5;
        vMeta = vec4(f, lutRow, mode, aCloudC.x);
        vSeed = seed;
        vFlags = flags;
      }
      `,
      /* glsl */ `
      ${SHARED_GLSL_LUT}
      uniform float uIsDark;
      varying vec2 vUv;
      varying vec4 vMeta;
      varying float vSeed;
      varying float vFlags;
      varying vec4 vFlowCoord;
      varying vec4 vFlowParams;

      float plasmaSmin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      float plasmaSmax(float a, float b, float k) {
        return -plasmaSmin(-a, -b, k);
      }

      float evalPlasmaHeight(
        vec2 lp,
        vec2 flowShift,
        vec2 seedVec,
        float spanLen,
        float nomWid,
        float flowStyle,
        float erosion,
        float f,
        out float outShallow,
        out float outDense,
        out float outSil
      ) {
        mat2 m1 = mat2(0.80, -0.60, 0.60, 0.80);
        mat2 m2 = mat2(0.60, 0.80, -0.80, 0.60);

        vec2 q = vec2(
          texture2D(uBrush, m1 * (lp * 0.032 - flowShift * 0.048) + seedVec).g - 0.5,
          texture2D(uBrush, m2 * (lp * 0.038 - flowShift * 0.056) + seedVec.yx + vec2(0.41, 0.19)).g - 0.5
        );
        vec2 r = vec2(
          texture2D(uBrush, m2 * (lp * 0.056 - flowShift * 0.088 + q * 0.24) - seedVec * 0.7).g - 0.5,
          texture2D(uBrush, m1 * (lp * 0.071 - flowShift * 0.105 + q * 0.28) + seedVec * 1.3 + vec2(0.23, 0.67)).g - 0.5
        );

        float sdShape = 1.0;
        if (flowStyle >= 0.5 && flowStyle < 1.5) {
          float mH = (q.y * 1.45 + r.x * 0.82) * smoothstep(0.25, 2.2, abs(lp.x));
          float wH = nomWid * (0.48 + 0.76 * smoothstep(1.22, 0.12, abs(lp.x) / spanLen + r.y * 0.34)) * (1.0 + q.x * 0.62 + r.y * 0.38);
          float dArmX = plasmaSmax(abs(lp.y - mH) - wH, abs(lp.x) - spanLen * (0.94 + 0.30 * q.x), 0.75);

          float mV = (q.x * 1.45 - r.y * 0.82) * smoothstep(0.25, 2.2, abs(lp.y));
          float wV = nomWid * (0.48 + 0.76 * smoothstep(1.22, 0.12, abs(lp.y) / spanLen - r.x * 0.34)) * (1.0 + q.y * 0.62 - r.x * 0.38);
          float dArmY = plasmaSmax(abs(lp.x - mV) - wV, abs(lp.y) - spanLen * (0.94 + 0.30 * q.y), 0.75);

          sdShape = plasmaSmin(dArmX, dArmY, 1.48);
        } else if (flowStyle >= 1.5 && flowStyle < 2.5) {
          vec2 sq = (lp + vec2(q.y, -q.x) * 1.25 + r * 0.72) / max(0.8, spanLen);
          float sqPow = pow(max(1e-4, abs(sq.x)), 3.2) + pow(max(1e-4, abs(sq.y)), 3.2);
          float sqDist = pow(max(1e-4, sqPow), 0.3125);
          sdShape = (sqDist - 0.90) * spanLen;
        } else {
          float isUltra = step(2.5, flowStyle);
          float uAlong = lp.x / spanLen;
          float swayScale = mix(1.0, 1.32, isUltra);
          float meander = (q.y * 1.68 + r.x * 0.92) * swayScale * (0.38 + 0.62 * smoothstep(-0.95, 0.65, uAlong));
          float profile = smoothstep(-1.18, -0.52, uAlong) * smoothstep(1.30, 0.08, uAlong + r.y * 0.58);
          float ultraBase = isUltra * 0.55 * exp(-pow((uAlong + 0.72) * 2.1, 2.0));
          float localWid = nomWid * (0.30 + 0.98 * profile + ultraBase) * (1.0 + q.x * 0.68 + r.y * 0.44);
          float dLat = abs(lp.y - meander) - localWid;
          float dEnd = max(-lp.x - spanLen * 0.96, lp.x - spanLen * (1.02 + 0.36 * q.x));
          sdShape = plasmaSmax(dLat, dEnd, 0.80);
        }

        vec2 dUv = m1 * (lp * 0.068 - flowShift * 0.115 + q * 0.35 + r * 0.22) + seedVec * 1.9;
        float bA = texture2D(uBrush, dUv).g;
        float bB = texture2D(uBrush, m2 * (dUv * 1.64 + vec2(0.31, 0.17))).g;
        float vorPillow = texture2D(uBrush, dUv * 0.88 + r * 0.19).r;
        float pocket = bA * 0.40 + bB * 0.24 + vorPillow * 0.36;
        float diss = erosion + 0.28 * smoothstep(0.44, 1.0, f);
        float erodedDist = sdShape - (pocket - 0.46) * 1.95 + diss * 0.62;
        outSil = 1.0 - smoothstep(-0.095, 0.045, erodedDist);

        float tNoise = texture2D(uBrush, m2 * (lp * 0.084 - flowShift * 0.145 + r * 0.31) - seedVec * 1.1).g;
        float rawFluid = clamp(pocket * 0.54 + tNoise * 0.46 - diss * 0.16, 0.0, 1.0);
        outShallow = smoothstep(0.14, 0.44, rawFluid);
        outDense = smoothstep(0.46, 0.74, rawFluid);

        float inside = clamp(-erodedDist / 0.44, 0.0, 1.0);
        float meniscus = 1.0 - pow(max(1e-4, 1.0 - inside), 2.4);
        float swell = smoothstep(0.16, 0.80, rawFluid);
        return meniscus * (0.36 + 0.64 * swell);
      }

      void main() {
        float f = vMeta.x;
        float row = vMeta.y;
        float mode = vMeta.z;
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);

        if (mode >= 4.5) {
          vec2 lp = vFlowCoord.xy;
          vec2 wp = vFlowCoord.zw;
          float spanLen = vFlowParams.x;
          float nomWid = vFlowParams.y;
          float flowStyle = vFlowParams.z;
          float erosion = vFlowParams.w;
          vec2 seedVec = vec2(fract(vSeed * 0.37), fract(vSeed * 0.73));

          vec2 flowShift;
          if (flowStyle >= 0.5 && flowStyle < 2.5) {
            vec2 radDir = lp / (length(lp) + 0.85);
            vec2 curlDir = vec2(-radDir.y, radDir.x) * 0.30;
            flowShift = (radDir + curlDir) * (f * 3.4);
          } else {
            flowShift = vec2(f * 4.2, sin(f * 3.0 + vSeed) * 0.35);
          }

          float shallow = 0.0;
          float dense = 0.0;
          float sil = 0.0;
          float h0 = evalPlasmaHeight(lp, flowShift, seedVec, spanLen, nomWid, flowStyle, erosion, f, shallow, dense, sil);
          float quadFade = 1.0 - smoothstep(0.36, 0.50, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
          float lifeEnv = smoothstep(0.0, 0.09, f) * (1.0 - smoothstep(0.16, 1.0, f));
          if (sil * quadFade * lifeEnv <= 0.002) discard;

          float eps = 0.09;
          float dmyA;
          float dmyB;
          float dmyC;
          float hX = evalPlasmaHeight(lp + vec2(eps, 0.0), flowShift, seedVec, spanLen, nomWid, flowStyle, erosion, f, dmyA, dmyB, dmyC);
          float hY = evalPlasmaHeight(lp + vec2(0.0, eps), flowShift, seedVec, spanLen, nomWid, flowStyle, erosion, f, dmyA, dmyB, dmyC);
          vec2 grad = vec2(hX - h0, hY - h0) / eps;
          vec3 norm = normalize(vec3(-grad * 0.68, 1.0));

          float ndh1 = max(dot(norm, normalize(vec3(-0.38, -0.48, 0.79))), 0.0);
          float ndh2 = max(dot(norm, normalize(vec3(0.42, 0.46, 0.78))), 0.0);
          float spec1 = pow(max(1e-4, ndh1), 34.0) * sil;
          float spec2 = pow(max(1e-4, ndh2), 20.0) * 0.32 * sil;

          vec2 cUv = lp * 0.095 - flowShift * 0.16 + norm.xy * 0.22 + seedVec;
          float cRidge = 1.0 - abs(texture2D(uBrush, cUv).g * 2.0 - 1.0);
          float caustic = pow(max(1e-4, clamp(cRidge, 0.0, 1.0)), 4.2) * sil * (0.28 + 0.72 * dense);

          vec2 gf = abs(fract(wp + norm.xy * 0.32) - 0.5);
          float refractedGrid = smoothstep(0.43, 0.495, max(gf.x, gf.y)) * sil;

          float glassBody = 0.085 + shallow * 0.095 + dense * 0.20;
          float optics = caustic * 0.11 + spec1 * 0.24 + spec2 * 0.08 + refractedGrid * 0.075;
          float rawAlpha = (glassBody + optics) * sil * quadFade * lifeEnv;
          float alpha = clamp(rawAlpha, 0.0, 0.48);
          if (alpha <= 0.003) discard;
          float energy = clamp(
            0.20 + shallow * 0.12 + dense * 0.24 + caustic * 0.18 + spec1 * 0.34 + spec2 * 0.12 + refractedGrid * 0.08,
            0.14,
            0.86
          );
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (mode >= 3.5) {
          if (d > 1.0) discard;
          float stage = max(1.0, vMeta.w);
          float spin = f * (10.0 + stage * 5.5);
          float ang = atan(p.y, p.x) - 3.6 * log(max(0.065, d)) - spin + vSeed;
          float blades = pow(0.5 + 0.5 * cos(ang * 5.0), 2.1);
          float subBlades = pow(0.5 + 0.5 * cos(ang * 3.0 + f * 6.0), 1.8);
          float wisp = texture2D(uBrush, vec2(d * 1.6 + f * 0.9, ang * 0.18 + vSeed * 0.2)).b;
          float eyeR = mix(0.68, 0.15, f);
          float eyeRing = exp(-pow((d - eyeR) / (0.14 - stage * 0.015), 2.0));
          float falloff = smoothstep(0.04, 0.24, d) * smoothstep(1.0, 0.18, d);
          float env = sin(clamp(f, 0.02, 0.98) * 3.1415926);
          float qiField = ((blades * 0.72 + subBlades * 0.34) * (0.48 + 0.72 * wisp) * falloff + eyeRing * 0.58) * env;
          float alpha = clamp(qiField * (0.56 + stage * 0.08), 0.0, 0.68);
          if (alpha <= 0.002) discard;
          float energy = clamp(0.32 + eyeRing * 0.42 + blades * 0.26 + stage * 0.06, 0.15, 0.92);
          vec4 col = sampleLut(row, energy);
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (mode >= 2.5) {
          vec2 edge = abs(p);
          float box = max(edge.x, edge.y);
          if (box > 0.98) discard;
          if (vFlags > 1.5) {
            float ang = atan(p.y, p.x) + 5.2 / max(0.18, d) - f * 14.0;
            float arms = pow(0.5 + 0.5 * cos(ang * 4.0 + vSeed), 2.2);
            float drain = smoothstep(0.08, 0.28, d) * smoothstep(0.98, 0.28, box);
            float pit = smoothstep(0.32, 0.05, d);
            float alpha = clamp((arms * 0.56 * drain + pit * 0.78) * smoothstep(1.0, 0.14, f), 0.0, 0.78);
            if (alpha <= 0.003) discard;
            vec4 col = sampleLut(row, clamp(0.34 + arms * 0.34, 0.1, 0.72));
            gl_FragColor = vec4(col.rgb * arms * (1.0 - pit * 0.88) * alpha, alpha);
            return;
          }
          vec2 seedOff = vec2(fract(vSeed * 0.37), fract(vSeed * 0.73));
          float v1 = texture2D(uBrush, vUv * 0.38 + seedOff + vec2(f * 0.16, -f * 0.11)).r;
          float v2 = texture2D(uBrush, vUv * 0.54 - seedOff * 0.6 - vec2(f * 0.14, 0.08)).g;
          float caustic = smoothstep(0.42, 0.10, v1 * 0.72 + (1.0 - v2) * 0.28) * smoothstep(0.98, 0.68, box);
          float rim = smoothstep(0.78, 0.90, box) * smoothstep(0.98, 0.92, box);
          float waveRing = smoothstep(0.14, 0.0, abs(fract(d * 1.35 - f * 1.8) - 0.5)) * 0.24 * smoothstep(0.96, 0.36, box);
          float alpha = clamp((caustic * 0.24 + rim * 0.34 + waveRing * 0.26 + 0.05 * smoothstep(0.95, 0.45, box)) * smoothstep(1.0, 0.16, f), 0.0, 0.42);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.24 + caustic * 0.24 + rim * 0.16, 0.1, 0.52));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (mode >= 1.5) {
          if (d > 1.0) discard;
          float n1 = texture2D(uBrush, vUv * 1.7 + vec2(f * 0.28, vSeed * 0.1)).g;
          float n2 = texture2D(uBrush, vUv * 2.9 - vec2(f * 0.36, 0.2)).g;
          float fbm = n1 * 0.6 + n2 * 0.4;
          float ring = exp(-pow((d - 0.56 - (fbm - 0.5) * 0.18) / 0.19, 2.0));
          float alpha = clamp(ring * (0.42 + 0.52 * fbm) * sin(clamp(f, 0.02, 0.98) * 3.1415926), 0.0, 0.72);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.42 + 0.42 * ring * fbm, 0.1, 0.88));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (mode >= 0.5) {
          float across = abs(p.x);
          float n1 = texture2D(uBrush, vec2(vUv.x * 1.8 + sin(vUv.y * 5.0 + vSeed) * 0.22, vUv.y * 1.5 - f * 2.2 + vSeed)).g;
          float n2 = texture2D(uBrush, vec2(vUv.x * 3.1 - f * 0.6, vUv.y * 2.4 - f * 3.1)).b;
          float flameField = smoothstep(0.96, 0.16, across) * (0.42 + 0.78 * (n1 * 0.58 + n2 * 0.42)) - f * 0.18;
          float body = smoothstep(0.24, 0.55, flameField);
          float rim = smoothstep(0.20, 0.30, flameField) - smoothstep(0.30, 0.52, flameField);
          float vertFade = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.22, vUv.y);
          float alpha = clamp((body * 0.38 + rim * 0.72) * vertFade * smoothstep(1.0, 0.14, f), 0.0, 0.65);
          if (alpha <= 0.002) discard;
          vec4 col = sampleLut(row, clamp(0.36 + rim * 0.48 + (1.0 - across) * 0.22 * n1, 0.1, 0.92));
          gl_FragColor = vec4(col.rgb * alpha, 0.0);
          return;
        }

        if (d > 1.0) discard;
        float radial = 1.0 - d;
        float fbmA = texture2D(uBrush, vUv * 1.4 + vec2(f * 0.35 + vSeed * 0.1, -f * 0.22)).g;
        float fbmB = texture2D(uBrush, vUv * 2.5 - vec2(f * 0.28, f * 0.31 + vSeed * 0.2)).g;
        float cloud = smoothstep(0.05, 0.68, pow(radial, 1.3) * (0.42 + 0.78 * (fbmA * 0.6 + fbmB * 0.4)));
        float env = sin(clamp(f, 0.02, 0.98) * 3.1415926);
        float alpha = clamp(cloud * env * (uIsDark > 0.5 ? 0.40 : 0.18), 0.0, uIsDark > 0.5 ? 0.46 : 0.22);
        if (alpha <= 0.003) discard;
        if (uIsDark > 0.5) {
          vec4 rim = sampleLut(row, 0.24);
          vec3 smoke = mix(vec3(0.03, 0.035, 0.05) * uSceneGain, rim.rgb * 0.24, (1.0 - radial) * 0.55);
          gl_FragColor = vec4(smoke * alpha, alpha);
          return;
        }
        vec4 col = sampleLut(row, clamp(0.24 + cloud * 0.24, 0.1, 0.50));
        gl_FragColor = vec4(col.rgb * alpha, 0.0);
      }
      `,
      {
        uProj: this.uProj,
        uResolution: this.uResUniform,
        uCell: this.uCellUniform,
        uIsDark: { value: isDark ? 1.0 : 0.0 },
        uLut: { value: this.lutTex },
        uBrush: { value: this.brushNoiseTex },
        uSceneGain: this.uSceneGainUniform,
      },
      isDark ? NormalBlending : AdditiveBlending,
    )
  }

  private createThresholdMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
      `,
      /* glsl */ `
      uniform sampler2D tInput;
      uniform vec2 uTexelSize;
      uniform float uHdrUnpack;
      varying vec2 vUv;

      vec3 extractBright(vec2 uv, float threshold, float knee) {
        vec3 c = texture2D(tInput, uv).rgb * uHdrUnpack;
        float luma = max(c.r, max(c.g, c.b));
        float soft = clamp((luma - threshold + knee) / (2.0 * knee), 0.0, 1.0);
        float w = max(soft * soft * knee, luma - threshold) / max(luma, 1e-4);
        return c * max(0.0, w);
      }

      void main() {
        vec2 o = uTexelSize * 0.75;
        vec3 acc = extractBright(vUv, 1.08, 0.28) * 0.4
          + extractBright(vUv + vec2(-o.x, -o.y), 1.08, 0.28) * 0.15
          + extractBright(vUv + vec2(o.x, -o.y), 1.08, 0.28) * 0.15
          + extractBright(vUv + vec2(-o.x, o.y), 1.08, 0.28) * 0.15
          + extractBright(vUv + vec2(o.x, o.y), 1.08, 0.28) * 0.15;

        // Subtle axial cross-glint on ultra-bright HDR cores
        vec2 star = uTexelSize * 2.5;
        vec3 glint =
          extractBright(vUv + vec2(-star.x, 0.0), 2.5, 0.4) +
          extractBright(vUv + vec2(star.x, 0.0), 2.5, 0.4) +
          extractBright(vUv + vec2(0.0, -star.y), 2.5, 0.4) +
          extractBright(vUv + vec2(0.0, star.y), 2.5, 0.4);
        gl_FragColor = vec4(acc + glint * 0.035, 1.0);
      }
      `,
      {
        tInput: { value: null },
        uTexelSize: { value: new Vector2(1 / 256, 1 / 256) },
        uHdrUnpack: this.uHdrUnpackUniform,
      },
      NoBlending,
    )
  }

  private createDownsampleMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
      `,
      /* glsl */ `
      uniform sampler2D tInput;
      uniform vec2 uTexelSize;
      varying vec2 vUv;

      void main() {
        vec2 o = uTexelSize * 1.25;
        vec3 c = texture2D(tInput, vUv).rgb * 0.4
          + texture2D(tInput, vUv + vec2(-o.x, -o.y)).rgb * 0.15
          + texture2D(tInput, vUv + vec2(o.x, -o.y)).rgb * 0.15
          + texture2D(tInput, vUv + vec2(-o.x, o.y)).rgb * 0.15
          + texture2D(tInput, vUv + vec2(o.x, o.y)).rgb * 0.15;
        gl_FragColor = vec4(c, 1.0);
      }
      `,
      {
        tInput: { value: null },
        uTexelSize: { value: new Vector2(1 / 128, 1 / 128) },
      },
      NoBlending,
    )
  }

  private createUpsampleMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
      `,
      /* glsl */ `
      uniform sampler2D tLow;
      uniform sampler2D tHigh;
      uniform vec2 uTexelSize;
      varying vec2 vUv;

      void main() {
        vec2 o = uTexelSize * 1.45;
        vec3 tent = texture2D(tLow, vUv).rgb * 0.28
          + (texture2D(tLow, vUv + vec2(-o.x, 0.0)).rgb
           + texture2D(tLow, vUv + vec2(o.x, 0.0)).rgb
           + texture2D(tLow, vUv + vec2(0.0, -o.y)).rgb
           + texture2D(tLow, vUv + vec2(0.0, o.y)).rgb) * 0.11
          + (texture2D(tLow, vUv + vec2(-o.x, -o.y)).rgb
           + texture2D(tLow, vUv + vec2(o.x, -o.y)).rgb
           + texture2D(tLow, vUv + vec2(-o.x, o.y)).rgb
           + texture2D(tLow, vUv + vec2(o.x, o.y)).rgb) * 0.07;
        vec3 base = texture2D(tHigh, vUv).rgb;
        gl_FragColor = vec4(base * 0.48 + tent * 0.52, 1.0);
      }
      `,
      {
        tLow: { value: null },
        tHigh: { value: null },
        uTexelSize: { value: new Vector2(1 / 64, 1 / 64) },
      },
      NoBlending,
    )
  }

  private createCompositeMaterial(): ShaderMaterial {
    return makeShaderMaterial(
      /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
      `,
      /* glsl */ `
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float uHdrUnpack;
      varying vec2 vUv;

      vec3 acesFilmic(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      void main() {
        vec4 scene = texture2D(tScene, vUv);
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        vec3 hdr = scene.rgb * uHdrUnpack + bloom * 0.46;
        float peak = max(hdr.r, max(hdr.g, hdr.b));
        vec3 satMapped = clamp(hdr / (1.0 + peak * 0.65), 0.0, 1.0);
        vec3 mapped = mix(acesFilmic(hdr), satMapped, 0.45);
        float lumAlpha = max(mapped.r, max(mapped.g, mapped.b));
        float outAlpha = clamp(max(scene.a, lumAlpha), 0.0, 1.0);
        if (outAlpha <= 0.002) discard;
        mapped = min(mapped, vec3(outAlpha));
        gl_FragColor = vec4(mapped, outAlpha);
      }
      `,
      {
        tScene: { value: null },
        tBloom: { value: null },
        uHdrUnpack: this.uHdrUnpackUniform,
      },
      NoBlending,
    )
  }
}
