import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { mountPetalMap, petalMapFrameMs } from '@/cinematic/petal-map'
import type { PetalLayer, PetalModel, PetalNode } from '@/cinematic/petal-map'
import { parseSigil } from '@/cinematic/sigil-dots'

// The three-petal map on its own, at #/preview/map, with a mock run to step
// through. The signs are pasted from the build spec rather than imported, so
// this page does not depend on the game files.

const GROVE = parseSigil(`
#.#.#.#.#.#.#.#
...............
.#...#...#...#.
...............
..#.#.....#.#..
...#.......#...
...............
....#.....#....
.....#...#.....
......#.#......
.......#.......
.......#.......
......#.#......
...............
....##...##....
`)

const COURT = parseSigil(`
...............
....##...##....
...#..#.#..#...
...#.......#...
...............
.....#...#.....
......#.#......
.......#.......
......#.#......
.....#...#.....
...............
...#.......#...
...#..#.#..#...
....##...##....
...............
`)

const CARCOSA = parseSigil(`
...............
.....#...#.....
...#.......#...
...............
...#.......#...
...............
...#.......#...
...............
...#.......#...
.....#...#.....
.......#.......
.......#.......
......#........
.......#.......
.....#..#......
`)

type Cells = [number, number][]
const rows = (sigil: Cells, from: number, to: number): Cells => sigil.filter(([, y]) => y >= from && y <= to)

type Plan = { index: 1 | 2 | 3; name: string; hue: string; sigil: Cells; nodes: Omit<PetalNode, 'state'>[] }

const PLAN: Plan[] = [
  {
    index: 1, name: 'GROVE', hue: '#9FCB6B', sigil: GROVE,
    nodes: [
      { id: '1.1', name: 'WANT', kind: 'skirmish', part: rows(GROVE, 10, 14) },
      { id: '1.2', name: 'MORE', kind: 'skirmish', part: rows(GROVE, 4, 9) },
      { id: '1.3', name: 'AGAIN', kind: 'skirmish', part: rows(GROVE, 0, 2) },
      { id: '1.B', name: 'DARK YOUNG / THOUSAND', kind: 'boss', part: GROVE },
    ],
  },
  {
    index: 2, name: 'COURT', hue: '#C4162E', sigil: COURT,
    nodes: [
      { id: '2.1', name: 'USHER', kind: 'skirmish', part: rows(COURT, 1, 3) },
      { id: '2.2', name: 'CLERK', kind: 'skirmish', part: rows(COURT, 5, 9) },
      { id: '2.3', name: 'AXE', kind: 'skirmish', part: rows(COURT, 11, 13) },
      { id: '2.B', name: 'QUEEN IN RED / VERDICT', kind: 'boss', part: COURT },
    ],
  },
  {
    index: 3, name: 'CARCOSA', hue: '#FFC857', sigil: CARCOSA,
    nodes: [
      { id: '3.1', name: 'HUSH', kind: 'skirmish', part: CARCOSA.filter(([, y]) => y >= 9) },
      { id: '3.2', name: 'AVERT', kind: 'skirmish', part: CARCOSA.filter(([x, y]) => y < 9 && x < 7) },
      { id: '3.3', name: 'AMEN', kind: 'skirmish', part: CARCOSA.filter(([x, y]) => y < 9 && x > 7) },
      { id: '3.B', name: '▯▯▯▯▯▯ / UNDISCLOSED', kind: 'boss', part: CARCOSA },
    ],
  },
]

const STEPS: { id: string; label: string; broken: string[] }[] = [
  { id: 'fresh', label: 'NOTHING BROKEN', broken: [] },
  { id: 'one', label: 'ONE BROKEN', broken: ['1.1'] },
  { id: 'mid', label: 'MID-LAYER', broken: ['1.1', '1.2'] },
  { id: 'cleared', label: 'LAYER CLEARED', broken: ['1.1', '1.2', '1.B'] },
  { id: 'court', label: 'SECOND PETAL', broken: ['1.1', '1.2', '1.B', '2.1', '2.3'] },
  { id: 'carcosa', label: 'THIRD PETAL', broken: ['1.1', '1.2', '1.B', '2.1', '2.3', '2.B', '3.2'] },
  { id: 'all', label: 'ALL CLEARED', broken: ['1.1', '1.2', '1.B', '2.1', '2.3', '2.B', '3.2', '3.3', '3.B'] },
]

const GHOSTS = ['0.B', '1.2', '1.2', '1.B', '1.B', '1.B', '2.1', '2.B', '2.B', '3.3', '3.B', '3.B', '3.B', '3.B']

// The campaign's rules in small: any two skirmishes open the boss and close
// the third; a broken boss clears the petal and opens the next.
function buildLayers(broken: string[]): PetalLayer[] {
  const isBroken = (id: string) => broken.includes(id)
  const cleared = PLAN.map(plan => plan.nodes.some(node => node.kind === 'boss' && isBroken(node.id)))
  const current = cleared.findIndex(done => !done)
  return PLAN.map((plan, at) => {
    const state = cleared[at] ? 'cleared' : at === current ? 'current' : 'locked'
    const skirmishes = plan.nodes.filter(node => node.kind === 'skirmish' && isBroken(node.id)).length
    const nodes = plan.nodes.map((node): PetalNode => ({
      ...node,
      state: isBroken(node.id) ? 'broken'
        : state === 'locked' ? 'locked'
        : state === 'cleared' ? 'closed'
        : node.kind === 'boss' ? (skirmishes >= 2 ? 'open' : 'locked')
        : skirmishes >= 2 ? 'closed' : 'open',
    }))
    return { index: plan.index, name: plan.name, hue: plan.hue, sigil: plan.sigil, state, nodes }
  })
}

const chip = (on: boolean): CSSProperties => ({
  padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent',
  border: `1px solid ${on ? 'rgba(255,255,255,.42)' : 'rgba(255,255,255,.12)'}`,
  color: on ? '#f5f5f5' : '#858585', fontSize: 10, letterSpacing: '.12em',
})

export default function PreviewMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState('fresh')
  const [broken, setBroken] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [ghosts, setGhosts] = useState(false)
  const [still, setStill] = useState(false)
  const [cost, setCost] = useState('')

  const model = useMemo((): PetalModel => {
    const layers = buildLayers(broken)
    return {
      layers,
      selected,
      ghosts: ghosts ? GHOSTS : [],
      gathered: 60 * layers.filter(layer => layer.state === 'cleared').length,
      reducedMotion: still,
    }
  }, [broken, selected, ghosts, still])
  const latest = useRef(model)
  latest.current = model

  const activate = (id: string) => {
    const node = latest.current.layers.flatMap(layer => layer.nodes).find(candidate => candidate.id === id)
    if (node?.state !== 'open') return
    setBroken(list => [...list, id])
    setSelected(null)
    setStep('')
  }
  const enter = useRef(activate)
  enter.current = activate

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const map = mountPetalMap(canvas, {
      getModel: () => latest.current,
      onSelect: setSelected,
      onActivate: id => enter.current(id),
    })
    const timer = window.setInterval(() => {
      const ms = petalMapFrameMs(canvas)
      setCost(ms === null ? '' : `draw ${ms.toFixed(2)} ms`)
    }, 500)
    return () => {
      window.clearInterval(timer)
      map.dispose()
    }
  }, [])

  // Arrow keys belong to whoever mounts the map. Here: step through the nodes
  // that can be entered, Enter to break one.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const open = latest.current.layers.flatMap(layer => layer.nodes).filter(node => node.state === 'open')
      if (!open.length) return
      const at = open.findIndex(node => node.id === latest.current.selected)
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') setSelected(open[(at + 1) % open.length].id)
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') setSelected(open[(at + open.length - 1) % open.length].id)
      else if (event.key === 'Enter' && at >= 0) enter.current(open[at].id)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (id: string, list: string[]) => {
    setStep(id)
    setBroken(list)
    setSelected(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#070707' }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} data-map="petals" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'manipulation' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '10px 14px 14px' }}>
        {STEPS.map(entry => (
          <button key={entry.id} type="button" data-step={entry.id} style={chip(step === entry.id)} onClick={() => choose(entry.id, entry.broken)}>
            {entry.label}
          </button>
        ))}
        <button type="button" data-toggle="ghosts" style={chip(ghosts)} onClick={() => setGhosts(on => !on)}>GHOSTS</button>
        <button type="button" data-toggle="still" style={chip(still)} onClick={() => setStill(on => !on)}>REDUCED MOTION</button>
        <span data-readout="cost" style={{ marginLeft: 'auto', color: '#555', fontSize: 10, letterSpacing: '.1em' }}>
          {selected ? `${selected} · ` : ''}{cost}
        </span>
      </div>
    </div>
  )
}
