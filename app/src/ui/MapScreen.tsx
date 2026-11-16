import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { battleStore } from '@/game/battle-store'
import type { BattleState } from '@/game/battle-types'
import { sigilPart } from '@/game/sigils'
import { campaignStore } from '@/campaign/campaign-store'
import type { CampaignSnapshot, RunState } from '@/campaign/campaign-store'
import { mountPetalMap } from '@/cinematic/petal-map'
import type { PetalLayer, PetalModel, PetalNode } from '@/cinematic/petal-map'
import { mapHum } from '@/cinematic/sound'
import { playReveal } from '@/cinematic/stage'
import { SeamText } from '@/story/SeamText'
import type { SeamItem } from '@/story/SeamText'
import { Transcript } from '@/story/Transcript'
import { inscriptionLines, releaseNoteLines } from '@/story/seams'
import { layerAt, nodeById, weightById } from '@/story/script'
import { LoadoutEditor } from './LoadoutEditor'
import { Modal } from './Modal'
import { brokenJustNow, brokenWasDrawn, enterNode, parkBattle, returnToTitle } from './flow'
import { godShown, layerHue, layerInk, layerSigil } from './layers'
import { playMoment } from './moments'
import { hasSeen, markSeen } from './seen'

const STATE_WORD = { open: 'OPEN', broken: 'BROKEN', closed: 'CLOSED', locked: 'LOCKED' } as const

// The petals for a list of broken nodes and the layer in play. The rules are
// the campaign store's: any two skirmishes open the boss and close the third.
// Kept here as well so the map can draw the moment before a node broke.
function petalLayers(broken: readonly string[], current: number): PetalLayer[] {
  return ([1, 2, 3] as const).map(index => {
    const authored = layerAt(index)?.nodes ?? []
    const skirmishes = authored.filter(node => node.kind === 'skirmish' && broken.includes(node.id)).length
    const nodes = authored.map((node): PetalNode => ({
      id: node.id, name: node.name, kind: node.kind === 'boss' ? 'boss' : 'skirmish', part: sigilPart(node.id),
      state: broken.includes(node.id) ? 'broken'
        : index < current ? 'closed'
        : index > current ? 'locked'
        : node.kind === 'boss' ? (skirmishes >= 2 ? 'open' : 'locked')
        : skirmishes >= 2 ? 'closed' : 'open',
    }))
    return {
      index, name: layerAt(index)?.name ?? '', hue: layerHue(index), sigil: layerSigil(index), nodes,
      state: current > index ? 'cleared' : current === index ? 'current' : 'locked',
    }
  })
}

// How long the map shows a node as it was before it breaks in front of the player.
const BREAK_AFTER_MS = 650

// A control that answers Enter and Space by itself.
const CONTROL = 'button, a[href], input, select, textarea, summary, [role="button"]'

// A layer's release notes and inscription are read once per run: a reset
// returns to the map without them, and so does a reload.
function seamKey(run: RunState): string {
  return `layer:${run.seed}:${run.layer}`
}

type Stage = 'seam' | 'reveal' | 'ready'

// The map between battles: the three petals, and a narrow column with the
// layer, its nodes, what the run holds and the three things to do here.
export function MapScreen({ campaign, state, reducedMotion }: { campaign: CampaignSnapshot; state: BattleState; reducedMotion: boolean }) {
  const { meta } = campaign
  const run = campaign.run as RunState
  const layer = layerAt(run.layer)
  const nodes = layer?.nodes ?? []
  const firstOpen = () => nodes.find(node => campaignStore.nodeState(node.id) === 'open')?.id ?? null
  const [stage, setStage] = useState<Stage>(() => (hasSeen(seamKey(run)) ? 'ready' : 'seam'))
  const [selected, setSelected] = useState<string | null>(firstOpen)
  const [modal, setModal] = useState<'rewire' | 'log' | null>(null)
  const [god] = useState(() => godShown(run.layer))
  // The node just broken, until the map has shown it breaking.
  const [pending, setPending] = useState<string | null>(() => {
    const id = brokenJustNow()
    return id && run.broken.includes(id) && sigilPart(id).length ? id : null
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const seam = useMemo((): SeamItem[] => [...releaseNoteLines(run.layer), ...inscriptionLines(run.layer)], [run.layer])
  const afterSeam = () => {
    markSeen(seamKey(run))
    setStage(run.layer === 1 && !hasSeen('reveal') ? 'reveal' : 'ready')
  }

  // The board waits on its title phase while the map is up, so REWIRE works.
  useEffect(() => parkBattle(), [])

  const model = useMemo((): PetalModel => {
    const layers = pending
      ? petalLayers(run.broken.filter(id => id !== pending), Number(pending[0]))
      : petalLayers(run.broken, run.layer)
    return {
      layers, selected, ghosts: meta.ghosts, reducedMotion,
      gathered: 60 * layers.filter(item => item.state === 'cleared').length,
    }
  }, [run, pending, selected, meta.ghosts, reducedMotion])
  const latest = useRef(model)
  latest.current = model

  const drawn = stage !== 'seam'
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !drawn) return
    const map = mountPetalMap(canvas, {
      getModel: () => latest.current,
      onSelect: id => setSelected(id),
      onActivate: id => enterNode(id),
    })
    return () => map.dispose()
  }, [drawn])

  useEffect(() => {
    if (!pending || stage !== 'ready') return
    const timer = window.setTimeout(() => {
      brokenWasDrawn()
      setPending(null)
    }, reducedMotion ? 0 : BREAK_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [pending, stage, reducedMotion])

  // The first time the map is seen: the board just fought was one dot of it.
  useEffect(() => {
    if (stage !== 'reveal') return
    let live = true
    const moment = playMoment(playReveal)
    void moment.done.then(() => {
      if (!live) return
      markSeen('reveal')
      setStage('ready')
    })
    return () => {
      live = false
      moment.cancel()
    }
  }, [stage])

  // The map's own sound: one quiet note for each petal the run has entered.
  useEffect(() => {
    if (stage !== 'ready') return
    mapHum.start(Math.min(3, run.layer))
    return () => mapHum.stop()
  }, [stage, run.layer])

  const selectedState = selected ? campaignStore.nodeState(selected) : null
  const canBreak = stage === 'ready' && selectedState === 'open'
  const enter = () => { if (canBreak && selected) enterNode(selected) }

  const keys = useRef({ enter, nodes, selected, modal, stage })
  keys.current = { enter, nodes, selected, modal, stage }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const now = keys.current
      // A modal has the keys while it is open (Escape closes it there).
      if (event.metaKey || event.ctrlKey || event.altKey || now.stage !== 'ready' || now.modal) return
      const target = event.target instanceof Element ? event.target : null
      // The row of the node list that has keyboard focus, if one has.
      const row = target?.closest<HTMLElement>('.map-nodes [data-node]') ?? null
      const step = ['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD'].includes(event.code) ? 1
        : ['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(event.code) ? -1 : 0
      if (step) {
        const at = now.nodes.findIndex(node => node.id === now.selected)
        const next = now.nodes[at < 0 ? (step > 0 ? 0 : now.nodes.length - 1) : (at + step + now.nodes.length) % now.nodes.length]
        if (next) {
          setSelected(next.id)
          // Focus on a row goes with the selection, so Enter there still means the node that is lit.
          if (row) row.parentElement?.querySelector<HTMLElement>(`[data-node="${next.id}"]`)?.focus()
        }
      } else if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
        // Focus on any other control: the key is that control's, not the map's.
        if (!row && target?.closest(CONTROL)) return
        // Focus on a node's row: the key is for that node. It selects it; on
        // the node already selected it breaks in, as a double click does.
        if (!event.repeat) {
          if (row?.dataset.node && row.dataset.node !== now.selected) setSelected(row.dataset.node)
          else now.enter()
        }
      } else if (event.code === 'KeyR') setModal('rewire')
      else if (event.code === 'KeyL') setModal('log')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const picked = selected ? nodeById(selected) : undefined
  const weights = run.weights.map(id => weightById(id)?.name ?? id)

  return (
    <div className="scene map-scene" style={{ '--story-accent': layerHue(run.layer), '--layer-ink': layerInk(run.layer) } as React.CSSProperties}>
      <div className="map-stage">
        <canvas ref={canvasRef} className="map-canvas" data-map="petals" aria-label="Map of the three layers" />
      </div>
      <aside className="map-column" inert={stage !== 'ready' || modal !== null}>
        <header className="map-layer">
          <div className="eyebrow">LAYER {run.layer} / 3</div>
          <h2>{layer?.name}</h2>
          <dl>
            <dt>DESIRE</dt><dd><strong className="map-hue">{layer?.desire}</strong>{layer?.desireGloss && <span>{layer.desireGloss}</span>}</dd>
            <dt>SIGN</dt><dd><strong>{god}</strong></dd>
          </dl>
        </header>

        <section className="map-section">
          <div className="section-heading"><span>NODES</span><strong>ANY TWO OPEN THE LAST</strong></div>
          <div className="map-nodes" role="listbox" aria-label="Nodes of this layer">
            {nodes.map(node => {
              const nodeState = campaignStore.nodeState(node.id)
              return (
                <button
                  type="button" role="option" key={node.id} data-node={node.id} data-state={nodeState}
                  className={`map-node is-${nodeState} ${selected === node.id ? 'selected' : ''}`}
                  aria-selected={selected === node.id}
                  onClick={() => setSelected(node.id)}
                  onDoubleClick={() => { if (nodeState === 'open') enterNode(node.id) }}
                >
                  <span>{node.id}</span><strong>{node.name}</strong><em>{STATE_WORD[nodeState]}</em>
                </button>
              )
            })}
          </div>
          <p className="map-line" aria-live="polite">{picked?.line}</p>
        </section>

        <section className="map-section map-run">
          <div className="map-stat">
            <span>SANITY</span><strong>{run.sanity}<small> / {run.tuning.maxSanity}</small></strong>
            <div className="map-meter"><i style={{ width: `${Math.max(0, Math.min(100, run.sanity / run.tuning.maxSanity * 100))}%` }} /></div>
          </div>
          <div className="map-stat"><span>ITERATION</span><strong>{meta.iteration}</strong></div>
          <div className="map-weights">
            <span>WEIGHTS</span>
            {weights.length ? <ul>{weights.map(name => <li key={name}>{name}</li>)}</ul> : <em>NONE INSTALLED</em>}
          </div>
        </section>

        <section className="map-actions">
          <button className="primary-action" onClick={enter} disabled={!canBreak}>BREAK <span>ENTER</span><ChevronRight size={16} /></button>
          <div className="map-minor">
            <button className="secondary-action" onClick={() => setModal('rewire')}>REWIRE <span>R</span></button>
            <button className="secondary-action" onClick={() => setModal('log')}>LOG <span>L</span></button>
          </div>
          <div className="map-foot">
            <button onClick={returnToTitle}>TITLE</button>
            <button onClick={() => battleStore.toggleMute()} aria-label="Toggle audio">{state.muted ? 'SOUND OFF' : 'SOUND ON'}</button>
          </div>
        </section>
      </aside>

      {stage === 'seam' && (
        <SeamText
          lines={seam} label={`${layer?.name ?? 'Layer'} gate`} reducedMotion={reducedMotion}
          onLine={line => campaignStore.recordLine(line.voice, line.text, line.id)}
          onDone={afterSeam}
        />
      )}

      {modal === 'rewire' && (
        <Modal onClose={() => setModal(null)} label="Rewire">
          <div className="eyebrow">BETWEEN BATTLES</div>
          <h2>REWIRE</h2>
          <LoadoutEditor
            loadout={battleStore.getLoadout()}
            buffs={state.player.buffs}
            privilegePerFlag={state.tuning.privilegePerFlag}
            onChange={next => battleStore.setLoadout(next)}
          />
        </Modal>
      )}
      {modal === 'log' && (
        <Modal onClose={() => setModal(null)} label="Log">
          <div className="eyebrow">ITERATION {meta.iteration}</div>
          <h2>LOG</h2>
          <Transcript entries={meta.transcript} />
        </Modal>
      )}
    </div>
  )
}
