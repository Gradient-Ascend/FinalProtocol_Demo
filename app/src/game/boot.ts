import { AudioSystem } from './audio'
import { BattleRenderer } from './battle-renderer'
import { battleStore } from './battle-store'

declare global {
  interface Window {
    __gameProbe?: () => { x: number; y: number; z: number }
    __battleProbe?: () => ReturnType<typeof battleStore.getSnapshot>
    __GAME_READY__?: boolean
  }
}

let session: { dispose: () => void } | null = null

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame()
  const renderer = new BattleRenderer(canvas, battleStore)
  const audio = new AudioSystem()
  battleStore.sfx = id => audio.sfx(id)
  battleStore.startMusic = () => audio.startMusic()

  const onKey = (event: KeyboardEvent): void => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace']
    if (keys.includes(event.code)) event.preventDefault()
    if (event.repeat && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return
    const phase = battleStore.getSnapshot().phase
    if (event.code === 'Space') {
      if (phase === 'title') battleStore.start()
      else if (phase === 'planning') void battleStore.executeTurn()
      else if (phase === 'victory' || phase === 'gameover') battleStore.restart()
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
    const cell = renderer.cellAt(event.clientX, event.clientY)
    if (cell) battleStore.addMove(cell)
  }
  const unsubscribe = battleStore.subscribe(() => {
    if (audio.muted !== battleStore.getSnapshot().muted) audio.toggleMute()
  })

  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', renderer.resize)
  canvas.addEventListener('click', onClick)
  window.__gameProbe = () => ({ ...battleStore.plannedPosition(), z: 0 })
  window.__battleProbe = () => battleStore.getSnapshot()

  session = {
    dispose: () => {
      renderer.dispose()
      audio.dispose()
      unsubscribe()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', renderer.resize)
      canvas.removeEventListener('click', onClick)
      delete window.__gameProbe
      delete window.__battleProbe
      window.__GAME_READY__ = false
    },
  }
}

export function stopGame(): void {
  session?.dispose()
  session = null
}
