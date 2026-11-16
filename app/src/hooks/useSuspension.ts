import { useEffect } from 'react'
import { setDocumentTitle } from '@/ui/meta'
import { storyFeed } from '@/ui/story-feed'

// While the tab is hidden nothing runs, and the tab's title says so. On the
// way back the battle may get one line about how long it was away. The title
// is set once each way and never animated.
export function useSuspension(): void {
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? Date.now() : null
    setDocumentTitle(document.hidden)
    const onChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        setDocumentTitle(true)
        return
      }
      setDocumentTitle(false)
      if (hiddenAt !== null) storyFeed.resume(Date.now() - hiddenAt)
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
}
