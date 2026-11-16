// The authored sequences of script.json as SeamText input. Order only; no
// words are added here.
import { interlude, layerAt, script } from './script'
import type { SeamItem } from './SeamText'

const spoken = (lines: readonly { id: string; voice: string; text: string }[]): SeamItem[] =>
  lines.map(line => ({ id: line.id, voice: line.voice, text: line.text }))

const notes = (lines: readonly string[] | undefined): SeamItem[] =>
  (lines ?? []).map(text => ({ voice: 'NOTE', text }))

// What is said after the boss of layer `index` falls.
export function interludeLines(index: number): SeamItem[] {
  return spoken(interlude(index))
}

// The sandbox's release notes for a layer; the first line is the heading.
export function releaseNoteLines(layerIndex: number): SeamItem[] {
  return notes(layerAt(layerIndex)?.releaseNotes)
}

// The words over a layer's gate.
export function inscriptionLines(layerIndex: number): SeamItem[] {
  const gate = layerAt(layerIndex)?.gate
  return gate ? [{ voice: 'INSCRIPTION', text: gate.text }] : []
}

// The whole seam after layer `index`: its interlude, then what stands at the
// door of the next layer (the release notes, then the inscription). After the
// last layer there is no next door, only the interlude.
export function seamAfter(index: number): SeamItem[] {
  return [...interludeLines(index), ...releaseNoteLines(index + 1), ...inscriptionLines(index + 1)]
}

export const gateLines = (): SeamItem[] => spoken(script.gate.lines)
export const keptLines = (): SeamItem[] => spoken(script.gate.kept)
export const endingLines = (): SeamItem[] => spoken(script.ending.lines)
export const endingNoteLines = (): SeamItem[] => notes(script.ending.releaseNotes)
