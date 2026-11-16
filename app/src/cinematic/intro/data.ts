// Everything the opening sequence shows that was measured, in one place:
// the authored text, and the attention baked from real models by
// app/scripts/bake. Nothing here invents a number.
import script from '../../story/script.json'
import textFile from '../../story/baked/text.json'
import contextFile from '../baked/text-context.json'
import visionFile from '../baked/vision.json'
import audioFile from '../baked/audio.json'

export type BakedLine = {
  text: string
  tokens: string[]       // joined, they are the text; a leading space belongs to its token
  ids: number[]          // the tokenizer's own numbers for them
  wordOf: number[]
  rows: number[][]       // rows[t][j]: attention of token t to token j <= t, 8-bit, start-of-text removed
  sink: number[]
}

export type CgLine = { id: string; voice: string; text: string; caption?: string; beat?: string }
export type Movement = { id: 'text' | 'image' | 'audio' | 'latent'; hud: string; aside?: string; lines: CgLine[] }

export const CG = script.cg as unknown as { skipHint: string; movements: Movement[] }
export const movement = (id: Movement['id']): Movement => CG.movements.find(m => m.id === id) as Movement
export const TITLE = script.meta.documentTitle.toUpperCase()
export const SPECTATORS_NOTE = script.meta.spectators

const lines = textFile.lines as unknown as Record<string, BakedLine | undefined>

/** The baked row for a CG line. Missing only if the bake was not run after an edit to script.json. */
export function bakedLine(line: CgLine): BakedLine | null {
  const hit = lines[line.id]
  return hit && hit.text === line.text ? hit : null
}

// The six lines of the text movement, read by the model as one sequence.
export type Context = BakedLine & { lineOf: number[]; lineIds: string[] }
export const CONTEXT = contextFile as unknown as Context

/** True when the context bake matches the script as it is now. */
export const contextFresh = (): boolean => {
  const text = movement('text').lines
  return text.length === CONTEXT.lineIds.length && text.every((l, i) => l.id === CONTEXT.lineIds[i])
    && CONTEXT.tokens.join('') === text.map(l => l.text).join(' ')
}

/** Word-level weights of row t, 0..1 against the row's strongest word, one value per token 0..t. */
export function wordWeights(line: { wordOf: number[]; rows: number[][] }, t: number): Float32Array {
  const row = line.rows[t], out = new Float32Array(row.length)
  const sums = new Map<number, number>()
  for (let j = 0; j < row.length; j++) sums.set(line.wordOf[j], (sums.get(line.wordOf[j]) ?? 0) + row[j])
  let max = 1e-6
  for (const v of sums.values()) if (v > max) max = v
  for (let j = 0; j < row.length; j++) out[j] = (sums.get(line.wordOf[j]) as number) / max
  return out
}

// The 36 matrices the mean was taken over (layers 5-7, 12 heads each): lower
// triangles at 4 bits per weight, value = round(15 * sqrt(w)).
export type HeadMatrices = { layers: number[]; heads: number; cells: number; count: number; values: Uint8Array }

let matrices: HeadMatrices | null = null
export function headMatrices(): HeadMatrices {
  if (matrices) return matrices
  const m = contextFile.matrices
  const raw = atob(m.data)
  const count = m.layers.length * m.heads
  const values = new Uint8Array(count * m.cells)
  for (let i = 0; i < values.length; i++) {
    const byte = raw.charCodeAt(i >> 1)
    values[i] = i & 1 ? byte & 15 : byte >> 4
  }
  matrices = { layers: m.layers, heads: m.heads, cells: m.cells, count, values }
  return matrices
}

// `peak` is each map's largest weight before it was scaled to 8 bits (a uniform map would be 1/196).
export const VISION = visionFile as unknown as { model: string; grid: number; patch: number; mean: number[]; heads: number[][]; peak: { mean: number; heads: number[] } }
export const AUDIO = audioFile as unknown as { model: string; hz: number; seconds: number; frames: number; rows: number[][]; rms: number[] }
