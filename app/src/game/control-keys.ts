// Whose key is it: the game's, or the control that has focus?
//
// Keyboard focus on a button, link or input makes Space and Enter that
// control's keys, as they are everywhere else. Focus that only a click left
// behind is not keyboard focus: some browsers leave focus on a button that
// was clicked and some do not, and a player who clicks a panel button and
// then presses Space means the game's Space, as before. With focus on the
// page or the board the game has every key.

// A control that answers Space and Enter by itself.
const CONTROL = 'button, a[href], input, select, textarea, summary, [role="button"]'
// One that is typed into: its keys are its own however it came by focus.
const TYPED = 'input, select, textarea'
// Focus that moves this soon after a pointer was pressed or let go moved
// because of it: onto the control that was clicked, or on from it (a dialog
// closed by its close button hands focus back to the button that opened it).
export const POINTER_FOCUS_MS = 500

type Target = { closest?: (selector: string) => unknown; matches?: (selector: string) => boolean }

// When a pointer was last pressed or let go with no key since, and the
// element that took focus because of it.
let pointerAt = -Infinity
let pointerFocused: EventTarget | null = null

const clock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())

export function notePointer(now = clock()): void {
  pointerAt = now
}

// A key does not change who has focus by itself; it changes how the next
// move of focus is read (Tab, or Escape closing a dialog).
export function noteKey(): void {
  pointerAt = -Infinity
}

export function noteFocus(target: EventTarget | null, now = clock()): void {
  pointerFocused = now - pointerAt <= POINTER_FOCUS_MS ? target : null
}

export function controlHasKey(event: { code: string; target: EventTarget | null }): boolean {
  if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return false
  const target = event.target as Target | null
  if (!target || typeof target.closest !== 'function' || !target.closest(CONTROL)) return false
  if (event.target !== pointerFocused) return true
  return typeof target.matches === 'function' && target.matches(TYPED)
}

// Watches how focus moves, for as long as the game is mounted. Returns the
// way to stop.
export function watchFocus(): () => void {
  const onPointer = (): void => notePointer()
  const onKey = (): void => noteKey()
  const onFocus = (event: FocusEvent): void => noteFocus(event.target)
  window.addEventListener('pointerdown', onPointer, true)
  window.addEventListener('pointerup', onPointer, true)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('focusin', onFocus, true)
  return () => {
    window.removeEventListener('pointerdown', onPointer, true)
    window.removeEventListener('pointerup', onPointer, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('focusin', onFocus, true)
    pointerAt = -Infinity
    pointerFocused = null
  }
}
