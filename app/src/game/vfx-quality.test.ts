import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttackFx } from './attack-fx'
import {
  DEFAULT_VFX_QUALITY,
  FrameBudgetGovernor,
  computeObliqueProjection,
  resolveVfxProfile,
  vfxQualityDescription,
  vfxQualityStore,
} from './vfx-quality'

function projectToCss(
  mat: Float32Array,
  gx: number,
  gy: number,
  gz: number,
  width: number,
  height: number,
): { x: number; y: number; wClip: number } {
  const xc = mat[0] * gx + mat[4] * gy + mat[8] * gz + mat[12]
  const yc = mat[1] * gx + mat[5] * gy + mat[9] * gz + mat[13]
  const wc = mat[3] * gx + mat[7] * gy + mat[11] * gz + mat[15]
  const ndcX = xc / wc
  const ndcY = yc / wc
  return {
    x: ((ndcX + 1) * 0.5) * width,
    y: ((1 - ndcY) * 0.5) * height,
    wClip: wc,
  }
}

afterEach(() => {
  vfxQualityStore.resetForTests()
  vi.unstubAllGlobals()
})

describe('vfxQualityStore user quality lever', () => {
  it('defaults to HIGH for magnificent-first VFX and lazily persists changes', async () => {
    const map = new Map<string, string>()
    const getItem = vi.fn((k: string) => map.get(k) ?? null)
    vi.stubGlobal('localStorage', {
      getItem,
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
    })
    vfxQualityStore.resetForTests()

    expect(DEFAULT_VFX_QUALITY).toBe('high')
    expect(getItem).not.toHaveBeenCalled()
    expect(vfxQualityStore.getSnapshot()).toBe('high')
    expect(getItem).toHaveBeenCalledWith('fp.vfxQuality')

    const listener = vi.fn()
    const unsub = vfxQualityStore.subscribe(listener)
    vfxQualityStore.set('medium')
    expect(vfxQualityStore.getSnapshot()).toBe('medium')
    expect(map.get('fp.vfxQuality')).toBe('"medium"')
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()

    // Corrupt stored values sanitize cleanly back to DEFAULT_VFX_QUALITY ('high')
    map.set('fp.vfxQuality', '"ultra-invalid"')
    vfxQualityStore.resetForTests()
    expect(vfxQualityStore.getSnapshot()).toBe('high')
    expect(vfxQualityDescription('auto')).toMatch(/adaptive/i)
  })
})

describe('resolveVfxProfile device compatibility & quality lever', () => {
  it('returns low 2D profile when WebGL2 is unavailable or user selects low', () => {
    const noGl = resolveVfxProfile({ hasWebGL: false, shortSidePx: 1080, cores: 16, deviceMemoryGb: 16 }, 'high')
    expect(noGl.tier).toBe('low')
    expect(noGl.bloomLevels).toBe(0)
    expect(noGl.maxFboPixels).toBe(0)

    const userLow = resolveVfxProfile({ hasWebGL: true, shortSidePx: 1080, cores: 16, deviceMemoryGb: 16 }, 'low')
    expect(userLow.tier).toBe('low')
    expect(userLow.governorEnabled).toBe(false)
  })

  it('honors explicit high/medium user choices over constrained hardware heuristics', () => {
    const swDevice = {
      hasWebGL: true,
      rendererInfo: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))',
      deviceMemoryGb: 4,
      cores: 4,
      shortSidePx: 390,
      coarsePointer: true,
    }
    const forcedHigh = resolveVfxProfile(swDevice, 'high')
    expect(forcedHigh.tier).toBe('high')
    expect(forcedHigh.maxParticles).toBe(8192)
    expect(forcedHigh.maxSolids).toBe(96)
    expect(forcedHigh.maxClouds).toBe(160)
    expect(forcedHigh.bloomLevels).toBe(4)
    expect(forcedHigh.governorEnabled).toBe(false)

    const forcedMedium = resolveVfxProfile({ hasWebGL: true, shortSidePx: 1080, cores: 16, deviceMemoryGb: 16 }, 'medium')
    expect(forcedMedium.tier).toBe('medium')
    expect(forcedMedium.maxSolids).toBe(48)
    expect(forcedMedium.maxClouds).toBe(80)
    expect(forcedMedium.bloomLevels).toBe(2)
    expect(forcedMedium.governorEnabled).toBe(false)

    const lowProfile = resolveVfxProfile({ hasWebGL: true, shortSidePx: 1080, cores: 16, deviceMemoryGb: 16 }, 'low')
    expect(lowProfile.maxSolids).toBe(0)
    expect(lowProfile.maxClouds).toBe(0)
  })

  it('adapts automatically with governor enabled when setting is auto', () => {
    const highAuto = resolveVfxProfile({
      hasWebGL: true,
      rendererInfo: 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
      deviceMemoryGb: 8,
      cores: 10,
      shortSidePx: 900,
      coarsePointer: false,
    }, 'auto')
    expect(highAuto.tier).toBe('high')
    expect(highAuto.governorEnabled).toBe(true)

    expect(resolveVfxProfile({ hasWebGL: true, shortSidePx: 390 }, 'auto').tier).toBe('medium')
    expect(resolveVfxProfile({ hasWebGL: true, shortSidePx: 900, coarsePointer: true }, 'auto').tier).toBe('medium')
    expect(resolveVfxProfile({ hasWebGL: true, shortSidePx: 900, deviceMemoryGb: 4 }, 'auto').tier).toBe('medium')
    expect(resolveVfxProfile({ hasWebGL: true, shortSidePx: 900, cores: 4 }, 'auto').tier).toBe('medium')
    expect(resolveVfxProfile({ hasWebGL: true, shortSidePx: 900, rendererInfo: 'SwiftShader' }, 'auto').tier).toBe('medium')
  })
})

describe('computeObliqueProjection anchored board lock', () => {
  it('locks gz = 0 points sub-pixel-exact to 2D board cells across pan and zoom', () => {
    const mat = new Float32Array(16)
    const cases = [
      { width: 646, height: 582, ox: 52, oy: 41, cell: 36 },
      { width: 1024, height: 768, ox: -38.5, oy: 94.25, cell: 54 },
      { width: 390, height: 320, ox: 14, oy: 18, cell: 19 },
    ]
    for (const c of cases) {
      computeObliqueProjection(mat, c.width, c.height, c.ox, c.oy, c.cell)
      for (const [gx, gy] of [[0, 0], [7.5, 7.5], [14.5, 2.5], [0.5, 14.5]]) {
        const mapped = projectToCss(mat, gx, gy, 0, c.width, c.height)
        expect(mapped.wClip).toBeCloseTo(1, 6)
        expect(mapped.x).toBeCloseTo(c.ox + gx * c.cell, 4)
        expect(mapped.y).toBeCloseTo(c.oy + gy * c.cell, 4)
      }
    }
  })

  it('pitches (~29.2 deg default) and foreshortens upward as gz increases into 2.5D space', () => {
    const mat = new Float32Array(16)
    computeObliqueProjection(mat, 800, 600, 130, 30, 36)
    const ground = projectToCss(mat, 7.5, 7.5, 0, 800, 600)
    const aloft = projectToCss(mat, 7.5, 7.5, 4.0, 800, 600)
    expect(aloft.wClip).toBeLessThan(ground.wClip)
    expect(aloft.y).toBeLessThan(ground.y)
  })
})

describe('FrameBudgetGovernor hysteresis', () => {
  it('steps down only when enabled (auto mode) and ignores idle frames & tab spikes', () => {
    const lockedCb = vi.fn()
    const locked = new FrameBudgetGovernor('high', lockedCb, 0.026, 18, false)
    for (let i = 0; i < 30; i++) expect(locked.record(0.05, true)).toBe('high')
    expect(lockedCb).not.toHaveBeenCalled()

    const onStepDown = vi.fn()
    const gov = new FrameBudgetGovernor('high', onStepDown, 0.026, 18, true)
    for (let i = 0; i < 30; i++) expect(gov.record(0.05, false)).toBe('high')
    for (let i = 0; i < 30; i++) expect(gov.record(0.25, true)).toBe('high')
    expect(onStepDown).not.toHaveBeenCalled()

    for (let i = 0; i < 17; i++) expect(gov.record(0.032, true)).toBe('high')
    expect(gov.record(0.032, true)).toBe('medium')
    expect(onStepDown).toHaveBeenCalledTimes(1)
    expect(onStepDown).toHaveBeenCalledWith('medium')
  })
})

describe('AttackFx Node-safety', () => {
  it('plays, steps, reports stats, and disposes cleanly without DOM globals across all 11 skills, overload, and enemy hits', () => {
    const fx = new AttackFx()
    const skills = ['base', 'manhattan', 'array', 'manifold', 'off', 'on', 'high', 'ultra', 'spike', 'flood', 'probe'] as const
    const eventsBySkill: Record<string, string[]> = {
      base: ['PUSH', 'BUMP'],
      array: ['PULL'],
      manifold: ['BREACH'],
      off: ['DROP'],
      on: ['LIVE'],
      high: ['SPREAD'],
      ultra: ['RAIL +3'],
      spike: ['PINNED'],
      flood: ['FILL'],
      probe: ['LIVE'],
    }
    for (const [idx, skillFx] of skills.entries()) {
      fx.clear()
      fx.play(
        {
          source: 'player',
          presetId: idx % 2 === 0 ? 'vector' : 'cot',
          origin: { x: 7, y: 8 },
          target: { x: 7, y: 4 },
          stepIndex: idx % 4,
          shape: idx % 2 === 0 ? 'square' : 'cross',
          range: idx % 2 === 0 ? 2 : 5,
          fx: skillFx,
          amount: 3,
          dealt: 3,
          securityBefore: skillFx === 'manifold' ? 2 : 0,
          blank: skillFx === 'flood' ? { x: 6, y: 4 } : undefined,
          movedTo: skillFx === 'base' ? { x: 7, y: 3 } : skillFx === 'array' ? { x: 7, y: 5 } : undefined,
          readTags: skillFx === 'ultra' ? ['LIVE', 'BREACH', 'SHIFT'] : undefined,
          events: eventsBySkill[skillFx] ?? [],
        },
        false,
        undefined,
        { peers: skillFx === 'high' ? [{ x: 7, y: 4 }, { x: 9, y: 8 }] : undefined },
      )
      for (let t = 0; t <= 950; t += 16) fx.step(t)
    }

    fx.clear()
    fx.play(
      {
        source: 'player',
        presetId: 'deck-1',
        origin: { x: 7, y: 8 },
        target: { x: 7, y: 4 },
        stepIndex: 0,
        shape: 'cross',
        range: 5,
        fx: 'overload',
        overload: true,
        amount: 9,
        dealt: 9,
        events: ['BREACH', 'LIVE', 'RAIL +2'],
        overloadSteps: [
          { fx: 'manifold', stepIndex: 0, amount: 2, dealt: 2, securityBefore: 2, events: ['BREACH'] },
          { fx: 'ultra', stepIndex: 3, amount: 5, dealt: 5, readTags: ['LIVE', 'BREACH'], events: ['RAIL +2'] },
        ],
      },
      false,
    )
    fx.play(
      {
        source: 'enemy',
        presetId: 'B01',
        origin: { x: 7, y: 4 },
        target: { x: 7, y: 8 },
        stepIndex: 0,
        shape: 'square',
        range: 4,
        amount: 3,
        dealt: 3,
      },
      false,
      'carcosa',
    )
    for (let t = 0; t <= 1300; t += 16) fx.step(t)

    expect(fx.stats().backend).toBe('2d')
    expect(fx.stats().tier).toBe('low')
    expect(fx.stats().activeSolids).toBe(0)
    expect(fx.stats().activeClouds).toBe(0)
    expect(fx.cellOffset(7, 4)).toEqual({ x: expect.any(Number), y: expect.any(Number) })
    expect(fx.shakeOffset()).toEqual({ x: expect.any(Number), y: expect.any(Number) })
    fx.clear()
    fx.dispose()
  })

  it('OVERLOAD triggers 3 chronological time-pause stages and 3 spatial-distortion grid shockwaves', () => {
    const fx = new AttackFx()
    fx.play(
      {
        source: 'player',
        presetId: 'deck-1',
        origin: { x: 7, y: 9 },
        target: { x: 7, y: 4 },
        stepIndex: 0,
        shape: 'cross',
        range: 5,
        fx: 'overload',
        overload: true,
        amount: 11,
        dealt: 11,
      },
      false,
    )

    const freezeStages = new Set<number>()
    let maxWarpMag = 0
    let maxCrest = 0
    for (let t = 0; t <= 1250; t += 16) {
      fx.step(t)
      const freeze = fx.timeFreezeState()
      if (freeze.intensity > 0.05) freezeStages.add(freeze.stage)
      if (t >= 700) {
        const warp = fx.cellWarp(10, 9)
        maxWarpMag = Math.max(maxWarpMag, Math.hypot(warp.x, warp.y))
        maxCrest = Math.max(maxCrest, warp.crest)
      }
    }

    expect([...freezeStages].sort()).toEqual([1, 2, 3])
    expect(maxWarpMag).toBeGreaterThan(0.01)
    expect(maxCrest).toBeGreaterThan(0.05)
    fx.dispose()
  })

  it('scheduleOverloadSfx schedules 3 ascending turbine revs, silent strike pockets, data burst, and 3 shockwaves', async () => {
    const { scheduleOverloadSfx } = await import('./audio')
    const oscs: Array<{
      type: string
      sets: Array<[number, number]>
      ramps: Array<[number, number]>
      startAt: number
    }> = []
    const gainEnvs: Array<Array<{ kind: string; val: number; time: number }>> = []

    const makeParam = (sets?: Array<[number, number]>, ramps?: Array<[number, number]>, log?: Array<{ kind: string; val: number; time: number }>) => ({
      value: 0,
      setValueAtTime(val: number, time: number) {
        sets?.push([val, time])
        log?.push({ kind: 'set', val, time })
      },
      linearRampToValueAtTime(val: number, time: number) {
        ramps?.push([val, time])
        log?.push({ kind: 'linear', val, time })
      },
      exponentialRampToValueAtTime(val: number, time: number) {
        ramps?.push([val, time])
        log?.push({ kind: 'exp', val, time })
      },
    })
    const node = { connect() { return node } }
    const ctx = {
      currentTime: 2.0,
      sampleRate: 44100,
      createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
      createGain() {
        const log: Array<{ kind: string; val: number; time: number }> = []
        gainEnvs.push(log)
        return { gain: makeParam(undefined, undefined, log), connect() { return node } }
      },
      createBiquadFilter: () => ({ type: 'bandpass', frequency: makeParam(), Q: { value: 1 }, connect() { return node } }),
      createBufferSource: () => ({ buffer: null, connect() { return node }, start() {}, stop() {} }),
      createOscillator() {
        const rec = { type: 'sine', sets: [] as Array<[number, number]>, ramps: [] as Array<[number, number]>, startAt: 0 }
        oscs.push(rec)
        return {
          get type() { return rec.type },
          set type(v: string) { rec.type = v },
          frequency: makeParam(rec.sets, rec.ramps),
          connect() { return node },
          start(when = 0) { rec.startAt = when },
          stop() {},
        }
      },
    }

    const sched = scheduleOverloadSfx(ctx as unknown as AudioContext, node as unknown as AudioNode, 2.0)
    expect(sched.strikes).toEqual([2.15, 2.38, 2.61])
    expect(sched.unleashAt).toBeCloseTo(2.70, 5)
    expect(sched.shockwaves).toEqual([2.70, 2.825, 2.95])

    const rotors = oscs.filter(o => o.type === 'sawtooth')
    expect(rotors).toHaveLength(3)
    expect(rotors.map(r => [r.sets[0][0], r.ramps[0][0]])).toEqual([
      [140, 330],
      [235, 560],
      [380, 960],
    ])
    const dataSquares = oscs.filter(o => o.type === 'square')
    expect(dataSquares).toHaveLength(8)
    for (const env of gainEnvs) {
      expect(env[0]).toMatchObject({ kind: 'set', val: 0 })
    }
  })
})
