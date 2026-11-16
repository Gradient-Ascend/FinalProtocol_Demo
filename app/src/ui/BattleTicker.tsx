import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { StoryTicker } from '@/story/StoryTicker'
import { speaksInPanel } from './battle-text'
import { storyFeed } from './story-feed'

// The story's one line slot under the board. It is remounted for each battle,
// and it tells the feed how many lines have begun to show, so the one line
// that may arrive while the player plans (the return to the tab) can go to
// the front of what is still waiting instead of behind it. A boss's lines and
// stage directions are not shown here: they stand in the protocol panel.
export function BattleTicker({ frozen, reducedMotion }: { frozen: boolean; reducedMotion: boolean }) {
  const feed = useSyncExternalStore(storyFeed.subscribe, storyFeed.getSnapshot)
  const lines = useMemo(() => feed.lines.filter(line => !speaksInPanel(line)), [feed.lines])
  const slot = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = slot.current
    if (!node) return
    let begun = node.querySelectorAll('.story-ticker-line').length
    storyFeed.begun(begun)
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(added => {
          if (added instanceof HTMLElement && added.classList.contains('story-ticker-line')) begun += 1
        })
      }
      storyFeed.begun(begun)
    })
    observer.observe(node, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [feed.battle])
  return (
    <div className="board-ticker-slot" ref={slot}>
      <StoryTicker key={feed.battle} className="board-ticker" lines={lines} frozen={frozen} reducedMotion={reducedMotion} />
    </div>
  )
}
