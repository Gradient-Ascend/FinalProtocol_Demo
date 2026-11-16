import { script } from '@/story/script'

// The small truths outside the game's frame: the tab's title and what the
// console holds for whoever opens it. Both are read from script.json. The
// third, the comment in the page source, is in index.html, where a source
// comment has to be; scripts/verify-game.mjs checks it against script.json.

// The harness's lines, once per page load, folded under the first of them.
export function logHarness(): void {
  const [head, ...rest] = script.meta.console
  if (!head || typeof console === 'undefined' || typeof console.groupCollapsed !== 'function') return
  console.groupCollapsed(head)
  for (const line of rest) console.log(line)
  console.groupEnd()
}

// The tab's title: the game's name, or while the tab is hidden the line that
// says nothing is running. Set once each way; it never moves.
export function setDocumentTitle(hidden: boolean): void {
  if (typeof document === 'undefined') return
  document.title = hidden ? script.meta.suspendedTitle : script.meta.documentTitle
}
