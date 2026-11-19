import { storage } from './storage'

/**
 * Device-compatibility, memory-tier selection, anchored oblique 2.5D projection,
 * user quality lever store, and adaptive frame-budget governance for battle VFX.
 *
 * Strictly Node-safe: no top-level references to window, document, navigator, or localStorage.
 */

export type VfxQualitySetting = 'auto' | 'low' | 'medium' | 'high'
export type VfxTier = 'high' | 'medium' | 'low'

export const VFX_QUALITY_MODES: readonly VfxQualitySetting[] = ['auto', 'low', 'medium', 'high']
export const DEFAULT_VFX_QUALITY: VfxQualitySetting = 'high'

export type VfxProfile = {
  tier: VfxTier
  maxParticles: number
  maxRibbons: number
  maxWaves: number
  maxDecals: number
  maxDpr: number
  sceneScale: number
  maxFboPixels: number
  bloomLevels: 0 | 2 | 4
  densityScale: number
  governorEnabled: boolean
}

export type VfxDeviceInput = {
  hasWebGL: boolean
  rendererInfo?: string
  deviceMemoryGb?: number
  cores?: number
  shortSidePx: number
  coarsePointer?: boolean
}

const PROFILES: Record<VfxTier, Omit<VfxProfile, 'governorEnabled'>> = {
  high: {
    tier: 'high',
    maxParticles: 8192,
    maxRibbons: 96,
    maxWaves: 64,
    maxDecals: 160,
    maxDpr: 2.0,
    sceneScale: 1.0,
    maxFboPixels: 960_000,
    bloomLevels: 4,
    densityScale: 1.0,
  },
  medium: {
    tier: 'medium',
    maxParticles: 3072,
    maxRibbons: 48,
    maxWaves: 32,
    maxDecals: 96,
    maxDpr: 1.35,
    sceneScale: 0.78,
    maxFboPixels: 320_000,
    bloomLevels: 2,
    densityScale: 0.62,
  },
  low: {
    tier: 'low',
    maxParticles: 768,
    maxRibbons: 0,
    maxWaves: 0,
    maxDecals: 0,
    maxDpr: 1.5,
    sceneScale: 0,
    maxFboPixels: 0,
    bloomLevels: 0,
    densityScale: 0.45,
  },
}

const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|software|basic render/i

function sanitizeQuality(raw: unknown): VfxQualitySetting {
  return raw === 'auto' || raw === 'low' || raw === 'medium' || raw === 'high'
    ? raw
    : DEFAULT_VFX_QUALITY
}

export function vfxQualityDescription(mode: VfxQualitySetting): string {
  switch (mode) {
    case 'high':
      return 'Full 2.5D HDR particles, 3D ribbons & 4-mip bloom.'
    case 'medium':
      return '2.5D HDR effects with scaled density & half-res bloom.'
    case 'low':
      return 'Minimal 2D vector effects; zero WebGL FBO memory.'
    case 'auto':
      return 'Hardware-adaptive tier with live frame-rate governor.'
  }
}

let cachedQuality: VfxQualitySetting | null = null
const qualityListeners = new Set<() => void>()

export const vfxQualityStore = {
  getSnapshot(): VfxQualitySetting {
    if (cachedQuality === null) {
      cachedQuality = sanitizeQuality(storage.get<unknown>('vfxQuality', DEFAULT_VFX_QUALITY))
    }
    return cachedQuality
  },
  set(next: VfxQualitySetting): void {
    const clean = sanitizeQuality(next)
    cachedQuality = clean
    storage.set('vfxQuality', clean)
    for (const listener of qualityListeners) listener()
  },
  subscribe(listener: () => void): () => void {
    qualityListeners.add(listener)
    return () => qualityListeners.delete(listener)
  },
  reload(): void {
    const prev = cachedQuality
    cachedQuality = null
    const next = this.getSnapshot()
    if (prev !== next) {
      for (const listener of qualityListeners) listener()
    }
  },
  resetForTests(): void {
    cachedQuality = null
  },
}

export function profileForTier(tier: VfxTier, governorEnabled = false): VfxProfile {
  return { ...PROFILES[tier], governorEnabled }
}

/**
 * Selects the runtime VFX profile from hardware capabilities and the user's Settings lever.
 * Defaults to honoring explicit HIGH first; AUTO adapts smoothly to constrained devices.
 */
export function resolveVfxProfile(
  input: VfxDeviceInput,
  setting: VfxQualitySetting = 'auto',
): VfxProfile {
  if (!input.hasWebGL || setting === 'low') {
    return profileForTier('low', false)
  }
  if (setting === 'high') {
    return profileForTier('high', false)
  }
  if (setting === 'medium') {
    return profileForTier('medium', false)
  }

  const isConstrained =
    input.shortSidePx < 680 ||
    input.coarsePointer === true ||
    (input.deviceMemoryGb !== undefined && input.deviceMemoryGb <= 4) ||
    (input.cores !== undefined && input.cores <= 4) ||
    SOFTWARE_RENDERER_RE.test(input.rendererInfo ?? '')
  const tier: VfxTier = isConstrained ? 'medium' : 'high'
  return profileForTier(tier, tier === 'high')
}

/**
 * Safely tests whether 16-bit half-float color render targets are both supported
 * and framebuffer-complete on the active WebGL context without leaking GL objects.
 */
export function probeHalfFloatRenderTarget(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined'
    ? gl instanceof WebGL2RenderingContext
    : 'RGBA16F' in gl && 'HALF_FLOAT' in gl

  if (isWebGL2) {
    const ext = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float')
    if (!ext) return false
  } else {
    const halfTex = gl.getExtension('OES_texture_half_float')
    const halfFbo = gl.getExtension('EXT_color_buffer_half_float')
    if (!halfTex || !halfFbo) return false
  }

  const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  let testTex: WebGLTexture | null = null
  let testFbo: WebGLFramebuffer | null = null

  try {
    testTex = gl.createTexture()
    testFbo = gl.createFramebuffer()
    if (!testTex || !testFbo) return false

    gl.bindTexture(gl.TEXTURE_2D, testTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    if (isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext
      gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA16F, 4, 4, 0, gl2.RGBA, gl2.HALF_FLOAT, null)
    } else {
      const halfTex = gl.getExtension('OES_texture_half_float')
      if (!halfTex) return false
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, halfTex.HALF_FLOAT_OES, null)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, testFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    return status === gl.FRAMEBUFFER_COMPLETE
  } catch {
    return false
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo)
    gl.bindTexture(gl.TEXTURE_2D, prevTex)
    if (testFbo) gl.deleteFramebuffer(testFbo)
    if (testTex) gl.deleteTexture(testTex)
  }
}

/**
 * Computes a column-major 4x4 clip-space projection matrix mapping board cell
 * coordinates `(gx, gy, gz)` onto CSS pixel viewport `(width, height)`:
 * - At `gz = 0`: `w_c = 1` and points align sub-pixel-exact to `(ox + gx * cell, oy + gy * cell)`.
 * - At `gz > 0`: points expand radially by `1 / (1 - gz / cameraHeight)` and pitch upward (~29.2° at default).
 */
export function computeObliqueProjection(
  out: Float32Array | number[],
  width: number,
  height: number,
  ox: number,
  oy: number,
  cell: number,
  cameraHeight = 19,
  tanPitch = 0.56,
): void {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const ch = Math.max(1, cameraHeight)

  // Column 0
  out[0] = (2 * cell) / w
  out[1] = 0
  out[2] = 0
  out[3] = 0

  // Column 1
  out[4] = 0
  out[5] = (-2 * cell) / h
  out[6] = 0
  out[7] = 0

  // Column 2
  out[8] = 0
  out[9] = (2 * cell * tanPitch) / h
  out[10] = -1.5 / ch
  out[11] = -1 / ch

  // Column 3
  out[12] = (2 * ox) / w - 1
  out[13] = 1 - (2 * oy) / h
  out[14] = 0.5
  out[15] = 1
}

/**
 * Monitors active busy-frame timings in AUTO mode and steps down from 'high' to
 * 'medium' once if sustained frame-time pressure exceeds budget.
 */
export class FrameBudgetGovernor {
  private ema = 0
  private initialized = false
  private overBudgetCount = 0

  constructor(
    private currentTier: VfxTier,
    private readonly onStepDown?: (nextTier: VfxTier) => void,
    private readonly thresholdSec = 0.026,
    private readonly requiredFrames = 18,
    private enabled = true,
  ) {}

  get tier(): VfxTier {
    return this.currentTier
  }

  setMode(tier: VfxTier, enabled: boolean): void {
    this.currentTier = tier
    this.enabled = enabled
    this.ema = 0
    this.initialized = false
    this.overBudgetCount = 0
  }

  record(dtSec: number, busy: boolean): VfxTier {
    if (!this.enabled || this.currentTier !== 'high' || !busy || dtSec <= 0 || dtSec > 0.1) {
      return this.currentTier
    }
    this.ema = this.initialized ? this.ema * 0.85 + dtSec * 0.15 : dtSec
    this.initialized = true

    if (this.ema > this.thresholdSec) {
      this.overBudgetCount++
      if (this.overBudgetCount >= this.requiredFrames) {
        this.currentTier = 'medium'
        this.overBudgetCount = 0
        this.onStepDown?.('medium')
      }
    } else {
      this.overBudgetCount = Math.max(0, this.overBudgetCount - 1)
    }
    return this.currentTier
  }
}
