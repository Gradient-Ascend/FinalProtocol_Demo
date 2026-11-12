import { useEffect, useRef, useState } from 'react'

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const doc = document as FullscreenDocument
  const root = document.documentElement as FullscreenRoot
  const canRequest = typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function'
  const available = canRequest && (doc.fullscreenEnabled !== false || doc.webkitFullscreenEnabled === true)

  const showNotice = (text: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500)
  }

  useEffect(() => {
    const sync = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement))
      window.dispatchEvent(new Event('resize'))
    }
    const onError = () => showNotice('Fullscreen could not be opened. Check your browser permissions.')
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    document.addEventListener('fullscreenerror', onError)
    sync()
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      document.removeEventListener('fullscreenerror', onError)
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  const toggle = async () => {
    if (!available) {
      showNotice('This browser does not support fullscreen. Add the game to your Home Screen for a standalone view.')
      return
    }
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen()
        else await doc.webkitExitFullscreen?.()
      } else if (root.requestFullscreen) {
        await root.requestFullscreen({ navigationUI: 'hide' })
      } else {
        await root.webkitRequestFullscreen?.()
      }
    } catch {
      showNotice('Fullscreen could not be opened. Check your browser permissions.')
    }
  }

  return { available, isFullscreen, notice, toggle }
}
