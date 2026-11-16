import { beforeEach, describe, expect, it } from 'vitest'
import { POINTER_FOCUS_MS, controlHasKey, noteFocus, noteKey, notePointer } from './control-keys'

// A stand-in for the element a key event is aimed at.
function element(kind: 'button' | 'input' | 'page') {
  return {
    closest: (selector: string) => (kind !== 'page' && selector.includes('button') ? {} : null),
    matches: (selector: string) => kind === 'input' && selector.includes('input'),
  } as unknown as EventTarget
}

// What the browser reports, in the order it reports it, on a clock the test holds.
let now = 0
const click = (target: EventTarget): void => { notePointer(now); noteFocus(target, now); now += 80; notePointer(now) }
const tabTo = (target: EventTarget): void => { noteKey(); noteFocus(target, now) }
const press = (code: string, target: EventTarget | null): boolean => { noteKey(); return controlHasKey({ code, target }) }

beforeEach(() => {
  now = 10_000
  noteKey()
  noteFocus(null, now)
})

describe('controlHasKey', () => {
  it('gives Space and Enter to the control that has keyboard focus', () => {
    const button = element('button')
    tabTo(button)
    for (const code of ['Space', 'Enter', 'NumpadEnter']) expect(press(code, button), code).toBe(true)
    // Focus a script put there after a key counts the same: a dialog closed
    // with Escape hands focus back to the button that opened it.
    const opener = element('button')
    click(element('button'))
    noteKey()
    noteFocus(opener, now)
    expect(press('Space', opener)).toBe(true)
  })

  it('keeps every key for the game when focus is on the page or the board', () => {
    const page = element('page')
    for (const code of ['Space', 'Enter', 'KeyR', 'KeyW', 'Backspace', 'Escape']) {
      expect(press(code, page), code).toBe(false)
      expect(press(code, null), code).toBe(false)
    }
  })

  it('keeps the other game keys even with keyboard focus on a control', () => {
    const button = element('button')
    tabTo(button)
    for (const code of ['KeyR', 'KeyW', 'KeyO', 'ArrowLeft', 'Backspace', 'Escape']) expect(press(code, button), code).toBe(false)
  })

  it('does not count the focus a click left on a button, however many keys follow', () => {
    const button = element('button')
    click(button)
    now += 60_000
    expect(press('KeyD', button)).toBe(false)
    expect(press('Space', button)).toBe(false)
    expect(press('Space', button)).toBe(false)
    // Nor focus that a click handed on: a dialog closed by its close button.
    const opener = element('button')
    click(element('button'))
    noteFocus(opener, now + 5)
    expect(press('Space', opener)).toBe(false)
    // Reached again with Tab, the same button has keyboard focus.
    tabTo(element('button'))
    tabTo(button)
    expect(press('Space', button)).toBe(true)
  })

  it('counts focus that arrives long after the last click as keyboard focus', () => {
    const button = element('button')
    click(element('button'))
    noteFocus(button, now + POINTER_FOCUS_MS)
    expect(press('Space', button)).toBe(false)
    click(element('button'))
    noteFocus(button, now + POINTER_FOCUS_MS + 1)
    expect(press('Space', button)).toBe(true)
  })

  it('leaves a field that is typed into its keys even when it was clicked', () => {
    const input = element('input')
    click(input)
    expect(press('Space', input)).toBe(true)
  })
})
