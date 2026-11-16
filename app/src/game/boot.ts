import { AudioSystem } from './audio'
import { BattleRenderer } from './battle-renderer'
import { battleStore } from './battle-store'
import { campaignStore } from '@/campaign/campaign-store'
import { reportOutcome, titlePrimary } from '@/ui/flow'

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number }
    __battleProbe?: () => ReturnType<typeof battleStore.getSnapshot>
    __mapProbe?: () => ReturnType<BattleRenderer['viewState']>
    __GAME_READY__?: boolean
  }
}

export type MapZoomCommand = 'in' | 'out' | 'reset'
let session: { dispose: () => void; zoom: (command: MapZoomCommand) => void } | null = null

export function zoomMap(command: MapZoomCommand): void {
  session?.zoom(command)
}

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame()
  const renderer = new BattleRenderer(canvas, battleStore)
  renderer.onZoomChange = zoom => window.dispatchEvent(new CustomEvent('map-zoom-changed', { detail: zoom }))
  const audio = new AudioSystem()
  battleStore.sfx = id => audio.sfx(id)
  battleStore.startMusic = () => audio.startMusic()

  // These are the battle's keys, and the title's Space. Every other scene
  // (the map, a reward, a seam) answers for its own.
  const onKey = (event: KeyboardEvent): void => {
    const scene = campaignStore.getSnapshot().scene
    if (scene !== 'battle' && scene !== 'title') return
    if (event.ctrlKey || event.metaKey) {
      if (['Equal', 'NumpadAdd'].includes(event.code)) { event.preventDefault(); renderer.zoomIn(); return }
      if (['Minus', 'NumpadSubtract'].includes(event.code)) { event.preventDefault(); renderer.zoomOut(); return }
      if (['Digit0', 'Numpad0'].includes(event.code)) { event.preventDefault(); renderer.resetZoom(); return }
    }
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace']
    if (keys.includes(event.code)) event.preventDefault()
    if (event.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return
    const phase = battleStore.getSnapshot().phase
    if (event.code === 'Space') {
      if (scene === 'title') titlePrimary()
      else if (phase === 'planning') void battleStore.executeTurn()
      // CONTINUE: the result goes to the run. R is the way to fight it again.
      else if (phase === 'victory' || phase === 'gameover') reportOutcome()
      return
    }
    if (scene === 'title') {
      if (event.code === 'KeyM') battleStore.toggleMute()
      return
    }
    if (event.code === 'Escape') {
      if (battleStore.getSnapshot().overloadArmed) battleStore.cancelOverload()
      else battleStore.togglePause()
      return
    }
    if (event.code === 'Backspace') { battleStore.undo(); return }
    if (event.code === 'KeyO') { battleStore.requestOverload(); return }
    if (event.code === 'KeyM') { battleStore.toggleMute(); return }
    if (event.code === 'KeyR' && (phase === 'victory' || phase === 'gameover')) { battleStore.restart(); return }
    const moves: Record<string, [number, number]> = {
      KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
      KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
    }
    const move = moves[event.code]
    if (move) battleStore.addStep(...move)
  }

  const onClick = (event: MouseEvent): void => {
    if (renderer.consumeGesture()) return
    const cell = renderer.cellAt(event.clientX, event.clientY)
    if (cell) battleStore.addMove(cell)
  }
  const unsubscribe = battleStore.subscribe(() => {
    if (audio.muted !== battleStore.getSnapshot().muted) audio.toggleMute()
  })
  // The battle's tone belongs to the battle: it stops when the scene leaves it.
  const unwatch = campaignStore.subscribe(() => {
    const scene = campaignStore.getSnapshot().scene
    if (scene !== 'battle' && scene !== 'entrance') audio.stopMusic()
  })

  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', renderer.resize)
  canvas.addEventListener('click', onClick)
  window.__gameProbe = () => ({ ...battleStore.plannedPosition(), z: 0 })
  window.__battleProbe = () => battleStore.getSnapshot()
  window.__mapProbe = () => renderer.viewState()

  session = {
    zoom: command => {
      if (command === 'in') renderer.zoomIn()
      else if (command === 'out') renderer.zoomOut()
      else renderer.resetZoom()
    },
    dispose: () => {
      renderer.dispose()
      audio.dispose()
      unsubscribe()
      unwatch()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', renderer.resize)
      canvas.removeEventListener('click', onClick)
      delete window.__gameProbe
      delete window.__battleProbe
      delete window.__mapProbe
      window.__GAME_READY__ = false
    },
  }
}

export function stopGame(): void {
  session?.dispose()
  session = null
}
