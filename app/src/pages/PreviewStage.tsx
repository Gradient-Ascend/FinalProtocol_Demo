import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { playEnding, playEntrance, playPhaseChange, playReset, playReveal, stageProbe, stageSeek, type StageHandle, type StageOptions } from '@/cinematic/stage'
import { sharedAudio, unlockAudio } from '@/cinematic/sound'
import { mountPetalMap, type PetalModel } from '@/cinematic/petal-map'
import { BattleRenderer } from '@/game/battle-renderer'
import { battleStore } from '@/game/battle-store'
import { ENCOUNTERS, encounterById, layerName } from '@/game/encounters'
import { SIGILS, sigilPart } from '@/game/sigils'

// One display moment, or the battle board on one encounter, on its own, at
// #/preview/stage, for building and checking them. The hash query:
//
//   moment=entrance|phase|reset|reveal|ending|board   (default board)
//   id=1.B            the encounter (default 1.B; 0.B is the Warden)
//   short=1           the short form of an entrance or phase change
//   reduced=1         as shown under reduced motion
//   muted=1           no sound
//   t=6.2             start that many seconds in
//   speed=0.001       hold (nearly) still there: a frame to look at
//   bare=1            no board under the moment
//
// With moment=board the real renderer is mounted on that encounter: click a
// cell to route, Space releases the turn, R restarts. Under any other moment
// the same board sits behind, as it does in the game, so the way a moment
// hands over to the battle can be judged; under the first reveal the map
// lies over that board, as the map scene does.
//
// window.__stageProbe() reports { t, done } (and the moment's length);
// window.__stageSkip() skips; window.__stageSeek(t) moves the clock;
// window.__stageAudio() is the shared sound (for metering); window.__stageBoard
// holds the store.

declare global {
  interface Window {
    __stageProbe?: () => { t: number; done: boolean; length: number }
    __stageSkip?: () => void
    __stageSeek?: (t: number) => void
    __stageAudio?: () => ReturnType<typeof sharedAudio>
    __stageBoard?: { store: typeof battleStore; renderer: BattleRenderer }
  }
}

// The map as the run first sees it: the first petal current and unbroken, the other two locked.
const FIRST_MAP: PetalModel = {
  layers: ([1, 2, 3] as const).map(index => ({
    index,
    name: layerName(index),
    hue: ['#9FCB6B', '#C4162E', '#FFC857'][index - 1],
    sigil: [SIGILS.grove, SIGILS.court, SIGILS.carcosa][index - 1],
    state: index === 1 ? 'current' as const : 'locked' as const,
    nodes: Object.values(ENCOUNTERS).filter(e => e.layer === index).map(e => ({
      id: e.id, name: e.name, kind: e.kind === 'boss' ? 'boss' as const : 'skirmish' as const,
      state: index === 1 && e.kind !== 'boss' ? 'open' as const : 'locked' as const, part: sigilPart(e.id),
    })),
  })),
  selected: null, ghosts: [], gathered: 0, reducedMotion: false,
}

const MOMENTS = ['entrance', 'phase', 'reset', 'reveal', 'ending', 'board'] as const
type Moment = typeof MOMENTS[number]

export default function PreviewStage() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const map = useRef<HTMLCanvasElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const { search } = useLocation()
  const [done, setDone] = useState(false)
  const [run, setRun] = useState(0)

  const query = new URLSearchParams(search)
  const asked = query.get('moment') ?? 'board'
  const moment: Moment = (MOMENTS as readonly string[]).includes(asked) ? asked as Moment : 'board'
  const id = query.get('id') ?? '1.B'
  const reduced = query.get('reduced') === '1'
  const bare = query.get('bare') === '1' || moment === 'ending'

  // The board: the real renderer on the real store.
  useEffect(() => {
    const element = canvas.current
    if (!element || bare) return
    let encounter
    try { encounter = encounterById(id) } catch { encounter = encounterById('0.B') }
    battleStore.load(encounter)
    if (battleStore.getSnapshot().reducedMotion !== reduced) battleStore.toggleReducedMotion()
    // An entrance plays before the battle starts; everything else on a battle in progress.
    if (moment !== 'entrance') battleStore.start()
    const renderer = new BattleRenderer(element, battleStore)
    const onResize = () => renderer.resize()
    const onClick = (event: MouseEvent) => {
      if (renderer.consumeGesture()) return
      const cell = renderer.cellAt(event.clientX, event.clientY)
      if (cell) battleStore.addMove(cell)
    }
    const onKey = (event: KeyboardEvent) => {
      if (moment !== 'board') return
      const phase = battleStore.getSnapshot().phase
      if (event.code === 'Space') {
        event.preventDefault()
        if (phase === 'title') battleStore.start()
        else if (phase === 'planning') void battleStore.executeTurn()
      }
      if (event.code === 'KeyR') battleStore.restart()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    element.addEventListener('click', onClick)
    window.__stageBoard = { store: battleStore, renderer }
    window.__mapProbe = () => renderer.viewState()
    return () => {
      renderer.dispose()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      element.removeEventListener('click', onClick)
      delete window.__stageBoard
      delete window.__mapProbe
    }
  }, [id, moment, reduced, bare, run])

  // Under the first reveal is the map, as in the game (the board stays mounted beneath it).
  useEffect(() => {
    const element = map.current
    if (!element || moment !== 'reveal' || bare) return
    const mounted = mountPetalMap(element, { getModel: () => ({ ...FIRST_MAP, reducedMotion: reduced }), onSelect: () => undefined, onActivate: () => undefined })
    return () => mounted.dispose()
  }, [moment, reduced, bare, run])

  // The moment, in a host laid over the board.
  useEffect(() => {
    const element = host.current
    if (!element || moment === 'board') return
    const number = (key: string) => {
      const value = Number(query.get(key))
      return Number.isFinite(value) && value > 0 ? value : undefined
    }
    const options: StageOptions = {
      host: element,
      reducedMotion: reduced,
      muted: query.get('muted') === '1',
      short: query.get('short') === '1',
      startAt: number('t'),
      speed: number('speed'),
    }
    setDone(false)
    let handle: StageHandle
    if (moment === 'entrance') handle = playEntrance(id, options)
    else if (moment === 'phase') handle = playPhaseChange(id, options)
    else if (moment === 'reset') handle = playReset(options)
    else if (moment === 'reveal') handle = playReveal(options)
    else handle = playEnding(options)
    let live = true
    void handle.done.then(() => {
      if (!live) return
      setDone(true)
      if (moment === 'entrance' && battleStore.getSnapshot().phase === 'title') battleStore.start()
    })
    window.__stageProbe = () => stageProbe() ?? { t: 0, done: true, length: 0 }
    window.__stageSkip = handle.skip
    window.__stageSeek = stageSeek
    window.__stageAudio = sharedAudio
    // Sound needs a gesture first, as everywhere.
    const unlock = () => { unlockAudio() }
    window.addEventListener('keydown', unlock)
    window.addEventListener('pointerdown', unlock)
    return () => {
      live = false
      handle.skip()
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('pointerdown', unlock)
      delete window.__stageProbe
      delete window.__stageSkip
      delete window.__stageSeek
      delete window.__stageAudio
    }
    // `query` is rebuilt from `search` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, run])

  return (
    <div data-preview-stage style={{ position: 'fixed', inset: 0, background: '#090909', overflow: 'hidden' }}>
      {!bare && <canvas id="game-canvas" ref={canvas} data-board style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
      {moment === 'reveal' && !bare && <canvas ref={map} data-map="petals" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#070707', fontFamily: '"JetBrains Mono", monospace' }} />}
      <div ref={host} data-stage-host style={{ position: 'absolute', inset: 0, pointerEvents: moment === 'board' ? 'none' : 'auto' }} />
      {done && (
        <button
          type="button"
          data-replay
          onClick={() => setRun(n => n + 1)}
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 2, padding: '8px 14px', background: 'none', border: '1px solid #333', borderRadius: 6, color: '#858585', fontSize: 11, letterSpacing: '0.12em', cursor: 'pointer' }}
        >
          DONE · REPLAY
        </button>
      )}
    </div>
  )
}
