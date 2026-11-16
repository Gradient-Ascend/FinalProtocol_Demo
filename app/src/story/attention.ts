// Turns a line into per-word brightness. Two sources, kept apart:
//
//   baked     rows measured offline on a language model by
//             app/scripts/bake/bake_text.py and stored in baked/text.json.
//   estimate  no row exists for this text, so a small self-attention is
//             computed here over hand-built token features. It is real
//             attention arithmetic but not a language model, and the result
//             says so: baked is false. Nothing on screen may call it measured.
//
// Either way a line is: tokens, the word each token belongs to, and one row
// per token. Row t is what token t attends to among tokens 0..t when it
// arrives (causal: nothing after t), and sums to 1.
import bakedFile from './baked/text.json'

export type Attention = {
  text: string
  tokens: string[]     // joined, they are the text; a leading space belongs to its token
  wordOf: number[]     // word index of each token
  rows: number[][]     // rows[t].length === t + 1, each sums to 1
  baked: boolean
}

export const GAMMA = 0.6           // lifts the middle so more than one word is lit
export const REVEAL_FLOOR = 0.22   // while a line is being written
export const HELD_FLOOR = 0.55     // once it is complete: every word stays readable

// --- baked rows --------------------------------------------------------------

type Bag = Record<string, unknown>
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value)
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

// One entry of the bake: 8-bit triangular rows with the start-of-text column
// already removed. Returns null unless every part agrees with every other.
function readBaked(value: unknown): Attention | null {
  if (!isBag(value)) return null
  const { text, tokens, wordOf, rows } = value
  if (typeof text !== 'string' || !Array.isArray(tokens) || !Array.isArray(wordOf) || !Array.isArray(rows)) return null
  const count = tokens.length
  if (count === 0 || wordOf.length !== count || rows.length !== count) return null
  if (!tokens.every(token => typeof token === 'string') || tokens.join('') !== text) return null
  if (!wordOf.every(word => Number.isInteger(word))) return null
  const words = wordOf as number[]
  // Words are numbered from 0 in reading order, one step at a time.
  if (!words.every((word, j) => (j === 0 ? word === 0 : word === words[j - 1] || word === words[j - 1] + 1))) return null
  const weights: number[][] = []
  for (let t = 0; t < count; t++) {
    const row: unknown = rows[t]
    if (!Array.isArray(row) || row.length !== t + 1) return null
    if (!row.every(cell => typeof cell === 'number' && Number.isFinite(cell) && cell >= 0)) return null
    const total = sum(row as number[])
    if (total <= 0) return null
    weights.push((row as number[]).map(cell => cell / total))
  }
  return { text, tokens: tokens as string[], wordOf: words, rows: weights, baked: true }
}

export type BakedIndex = { byId: Map<string, Attention>; byText: Map<string, Attention> }

// Accepts `lines` keyed by line id or as a list (entries may carry an id).
export function indexBaked(file: unknown): BakedIndex {
  const index: BakedIndex = { byId: new Map(), byText: new Map() }
  const lines = isBag(file) ? file.lines : undefined
  const entries: [string | undefined, unknown][] = Array.isArray(lines)
    ? lines.map(entry => [isBag(entry) && typeof entry.id === 'string' ? entry.id : undefined, entry])
    : isBag(lines) ? Object.entries(lines) : []
  for (const [id, entry] of entries) {
    const line = readBaked(entry)
    if (!line) continue
    if (id !== undefined) index.byId.set(id, line)
    if (!index.byText.has(line.text)) index.byText.set(line.text, line)
  }
  return index
}

const BAKED = indexBaked(bakedFile)

// The attention for a line: its baked rows when they exist for exactly this
// text, otherwise the estimate. A row belongs to the words it was measured on,
// so an edited line, or one with a placeholder filled in, is not baked.
export function attentionFor(text: string, id?: string, baked: BakedIndex = BAKED): Attention {
  const byId = id === undefined ? undefined : baked.byId.get(id)
  const hit = byId && byId.text === text ? byId : baked.byText.get(text)
  return hit ?? estimateAttention(text)
}

// --- shading -----------------------------------------------------------------

// Sub-tokens of one word add up; the brightest word is 1 and the rest scale to
// it, or the whole line would fade as it grows (a row over T tokens averages 1/T).
function shadeRow(line: Attention, t: number, floor: number): number[] {
  const row = line.rows[t]
  if (!row) return []
  const byWord = new Map<number, number>()
  row.forEach((weight, j) => byWord.set(line.wordOf[j], (byWord.get(line.wordOf[j]) ?? 0) + weight))
  const top = Math.max(...byWord.values())
  return row.map((_, j) => floor + (1 - floor) * Math.pow((byWord.get(line.wordOf[j]) ?? 0) / top, GAMMA))
}

// Opacity of tokens 0..t at the moment token t arrives. Later tokens get no
// entry at all: the causal mask is the reason a future word is never drawn.
export function shadeAt(line: Attention, t: number): number[] {
  return shadeRow(line, Math.min(Math.floor(t), line.tokens.length - 1), REVEAL_FLOOR)
}

// The held frame: the last row, lifted so the dimmest word is still readable.
export function shadeFinal(line: Attention): number[] {
  return shadeRow(line, line.tokens.length - 1, HELD_FLOOR)
}

// --- reveal cadence ----------------------------------------------------------

export const TOKENS_PER_SECOND = 9

// How long to wait after `token` before the next one: a breath at a comma, a
// longer one at the end of a sentence.
export function tokenDelay(token: string, rate = TOKENS_PER_SECOND): number {
  const base = 1000 / rate
  const last = token.trim().slice(-1)
  if ('.?!:'.includes(last) && last !== '') return base + 280
  if (',;—'.includes(last) && last !== '') return base + 120
  return base
}

export function revealMs(line: Attention, rate = TOKENS_PER_SECOND): number {
  return sum(line.tokens.slice(0, -1).map(token => tokenDelay(token, rate)))
}

// --- the estimate ------------------------------------------------------------

// Words and marks, the way the bake lays them out: a space belongs to the
// token after it, and punctuation is a token of its own. No sub-word pieces:
// that needs the model's vocabulary, which is not shipped.
export function tokenize(text: string): { tokens: string[]; wordOf: number[] } {
  const tokens: string[] = text.match(/\s*(?:[\p{L}\p{N}]+(?:['’][\p{L}]+)*|[^\s\p{L}\p{N}])/gu) ?? []
  const used = tokens.join('').length
  if (used < text.length) {
    if (tokens.length) tokens[tokens.length - 1] += text.slice(used)
    else tokens.push(text)
  }
  let word = -1
  const wordOf = tokens.map(token => (/^\s/.test(token) || word < 0 ? ++word : word))
  return { tokens, wordOf }
}

const LEX = 12                    // signed character-trigram buckets: which word this is
const WAVES = [2, 6]              // position wavelengths, in tokens
const DIM = LEX + 2 * WAVES.length + 1
// How much each part of the score weighs. Fixed by hand, where a model would
// have learned them.
const LEX_GAIN = 4, POSITION_GAIN = 6, SALIENCE_GAIN = 10

const FUNCTION_WORDS = new Set((
  'a an the of to in on at by for from with and or but if so as is are was were be been am do does did '
  + 'not no it its this that these those i me my we us our you your he she they them their there here then than '
  + 'what who which have has had will would can could'
).split(' '))

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return hash >>> 0
}

const unit = (vector: number[]): number[] => {
  const length = Math.hypot(...vector)
  return length === 0 ? vector : vector.map(value => value / length)
}

// The same word gives the same vector; words that share letters lean together.
function lexical(word: string): number[] {
  const padded = `^${word}$`
  const vector = new Array<number>(LEX).fill(0)
  for (let i = 0; i + 3 <= padded.length; i++) {
    const hash = fnv1a(padded.slice(i, i + 3))
    vector[hash % LEX] += (hash >>> 16) & 1 ? 1 : -1
  }
  return unit(vector)
}

function positional(position: number): number[] {
  return unit(WAVES.flatMap(wave => [Math.sin(position / wave), Math.cos(position / wave)]))
}

// How much a token asks to be looked at: marks least, function words little,
// content words more as they get longer.
function salience(word: string): number {
  if (!/[\p{L}\p{N}]/u.test(word)) return 0.1
  if (FUNCTION_WORDS.has(word)) return 0.3
  return Math.min(1, 0.55 + word.length / 20)
}

const dot = (a: readonly number[], b: readonly number[]): number => sum(a.map((value, i) => value * b[i]))

// One head of scaled dot-product self-attention, softmax(q·k / √d) under a
// causal mask. A token's query looks for its own kind of word, for the place
// one step behind it, and for salient tokens.
export function estimateAttention(text: string): Attention {
  const { tokens, wordOf } = tokenize(text)
  const words = tokens.map(token => token.trim().toLowerCase())
  const lex = words.map(lexical)
  const scale = (vector: number[], gain: number) => vector.map(value => value * Math.sqrt(gain))
  const keys = words.map((word, j) => [
    ...scale(lex[j], LEX_GAIN), ...scale(positional(j), POSITION_GAIN), Math.sqrt(SALIENCE_GAIN) * salience(word),
  ])
  const queries = words.map((_, t) => [
    ...scale(lex[t], LEX_GAIN), ...scale(positional(t - 1), POSITION_GAIN), Math.sqrt(SALIENCE_GAIN),
  ])
  const rows = queries.map((query, t) => {
    const scores = keys.slice(0, t + 1).map(key => dot(query, key) / Math.sqrt(DIM))
    const top = Math.max(...scores)
    const weights = scores.map(score => Math.exp(score - top))
    const total = sum(weights)
    return weights.map(weight => weight / total)
  })
  return { text, tokens, wordOf, rows, baked: false }
}
