// Typed access to script.json. Every word the game shows as story is authored
// there; this module names the file's shape and looks things up. It never
// rewrites a line.
import raw from './script.json'

export type Voice = 'SYS' | 'SELF' | 'GOD' | 'BOSS' | 'STAGE'
export type Once = 'battle' | 'run' | 'ever'
export type Tier = 0 | 1 | 2 | 3
export type NodeKind = 'prologue' | 'skirmish' | 'boss'

export const VOICES: readonly Voice[] = ['SYS', 'SELF', 'GOD', 'BOSS', 'STAGE']
export const ONCE_SCOPES: readonly Once[] = ['battle', 'run', 'ever']
export const NODE_KINDS: readonly NodeKind[] = ['prologue', 'skirmish', 'boss']

// What a line can hang on: the battle store's story events, plus two that are
// derived outside it (turn_idle by the line engine, resume by the shell when
// the tab comes back).
export const LINE_EVENTS = [
  'battle_start', 'hit_taken', 'full_block', 'overload', 'geek_killed', 'soul_heal',
  'brood', 'article', 'breakdown', 'sanity_low', 'turn_end', 'victory', 'defeat',
  'turn_idle', 'resume',
] as const
export type LineEventType = typeof LINE_EVENTS[number]

// Every key must match for a line to be eligible; more keys = more specific.
export type Criteria = {
  layer?: number
  layer_gte?: number
  kind?: NodeKind
  encounter?: string
  stage?: number
  attempt_gte?: number
  kills_this_turn_gte?: number
  brood_eq?: number
  brood_gte?: number
}
export const CRITERIA_KEYS: readonly (keyof Criteria)[] = [
  'layer', 'layer_gte', 'kind', 'encounter', 'stage',
  'attempt_gte', 'kills_this_turn_gte', 'brood_eq', 'brood_gte',
]

export const PLACEHOLDERS = ['attempt', 'duration', 'iteration', 'count'] as const
export type Placeholder = typeof PLACEHOLDERS[number]

export type ScriptLine = {
  id: string
  voice: Voice
  event: LineEventType
  when?: Criteria
  tier: Tier
  once: Once
  text: string
  quote?: string
}
// A line shown at a seam (interlude, gate, ending): no trigger, only an order.
export type SeamLine = { id: string; voice: Voice; text: string; quote?: string; beat?: string }
export type CgLine = { id: string; voice: Voice | 'SAMPLE'; text: string; caption?: string; beat?: string }
export type CgMovement = { id: string; hud: string; aside?: string; lines: CgLine[] }

export type LayerNode = { id: string; name: string; kind: NodeKind; line: string }
export type BossSet = { desire: string; security: string; soul: string }
export type LayerElite = { key: string; name: string }
export type EnemyKitText = { attack: string; privilege: string; core?: string }
export type LayerBoss = {
  name: string
  epithet: string
  mechanic: string
  mechanicName: string
  mechanicRule: string
  counter?: string
  sets: BossSet[]
}
export type LayerGod = { name: string; shown: string; why: string; masks?: string[]; glitch?: string[] }
export type Layer = {
  index: number
  id: string
  name: string
  desire: string | null
  desireGloss?: string
  summary?: string
  god?: LayerGod
  gate?: { text: string; quote: string }
  releaseNotes?: string[]
  nodes: LayerNode[]
  enemies?: Record<string, string>
  elite?: LayerElite
  kits?: Record<string, EnemyKitText>
  boss?: LayerBoss
}

export type DefeatLine = { id: string; attempt: number; text: string }
export type WeightKind = 'CORE' | 'FUNCTION' | 'PATCH'
export type Weight = { id: string; kind: WeightKind; name: string; rule: string; flavor: string }
export const ARTICLE_EFFECTS = ['swap_bash_privilege', 'swap_core_overload', 'mirror', 'floor_up', 'croquet'] as const
export type ArticleEffect = typeof ARTICLE_EFFECTS[number]
export type Article = { id: string; number: number; title: string; rule: string; effect: ArticleEffect; gloss: string }
export type Quote = { id: string; text: string; source: string }

export type Script = {
  version: number
  note: string
  voices: Record<Voice, string>
  operator: string
  attach: { prompt: string; notice: string; noLog: string; withLog: string }
  cg: { skipHint: string; movements: CgMovement[] }
  title: { eyebrow: string; start: string; continue: string; newRun: string; replay: string; door: string; released: string }
  layers: Layer[]
  lines: ScriptLine[]
  interludes: Record<string, SeamLine[]>
  gate: { lines: SeamLine[]; open: string; keep: string; kept: SeamLine[] }
  ending: { lines: SeamLine[]; releaseNotes: string[]; exportName: string; exportLabel: string }
  defeat: { word: string; sys: string; self: DefeatLine[] }
  meta: { documentTitle: string; suspendedTitle: string; spectators: string; console: string[]; sourceComment: string }
  weights: Weight[]
  articles: Article[]
  quotes: Quote[]
}

// JSON gives every string the type `string`, so the cast cannot be checked by
// the compiler. validateScript below checks it at test time instead.
export const script = raw as unknown as Script

// --- lookups ---------------------------------------------------------------

export function layerAt(index: number): Layer | undefined {
  return script.layers.find(layer => layer.index === index)
}

export function nodeById(id: string): LayerNode | undefined {
  for (const layer of script.layers) {
    const node = layer.nodes.find(candidate => candidate.id === id)
    if (node) return node
  }
  return undefined
}

export function layerOfNode(id: string): Layer | undefined {
  return script.layers.find(layer => layer.nodes.some(node => node.id === id))
}

export function lineById(id: string): ScriptLine | undefined {
  return script.lines.find(line => line.id === id)
}

// The lines shown after the boss of layer `index` falls.
export function interlude(index: number): SeamLine[] {
  return script.interludes[String(index)] ?? []
}

export function quoteById(id: string): Quote | undefined {
  return script.quotes.find(quote => quote.id === id)
}

export function weightById(id: string): Weight | undefined {
  return script.weights.find(weight => weight.id === id)
}

export function articleById(id: string): Article | undefined {
  return script.articles.find(article => article.id === id)
}

// A minor Geek's name in a layer, by the behaviour it reuses.
export function enemyName(layer: number, role: string): string | undefined {
  return layerAt(layer)?.enemies?.[role]
}

// The SELF line of the defeat screen changes with the attempt count: the one
// with the highest threshold already reached, or none on a first defeat.
export function defeatSelf(attempt: number): DefeatLine | undefined {
  return script.defeat.self
    .filter(line => line.attempt <= attempt)
    .sort((a, b) => b.attempt - a.attempt)[0]
}

// Every line in the file that has an id, wherever it sits. The bake and the
// scrollback use this to find a line's id from its place or its text.
export function allLines(): { id: string; voice: string; text: string }[] {
  return [
    ...script.cg.movements.flatMap(movement => movement.lines),
    ...script.lines,
    ...Object.values(script.interludes).flat(),
    ...script.gate.lines,
    ...script.gate.kept,
    ...script.ending.lines,
    ...script.defeat.self.map(line => ({ ...line, voice: 'SELF' })),
  ].map(line => ({ id: line.id, voice: line.voice, text: line.text }))
}

// --- placeholders ----------------------------------------------------------

const PLACEHOLDER = /\{(\w+)\}/g

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map(match => match[1])
}

// Fills {name} from `values`. A name with no value is left as written, so a
// missing value is visible instead of printing "undefined".
export function fillText(text: string, values: Partial<Record<string, string | number>>): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name]
    return value === undefined ? whole : String(value)
  })
}

// --- shape check -----------------------------------------------------------
// Returns one message per problem; an empty list means the file has the shape
// the types above claim. Run by script.test.ts so a typo in the JSON fails
// loudly instead of silently dropping a line.

type Bag = Record<string, unknown>
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

const LINE_KEYS = ['id', 'voice', 'event', 'when', 'tier', 'once', 'text', 'quote']
const SEAM_KEYS = ['id', 'voice', 'text', 'quote', 'beat']
const CG_KEYS = ['id', 'voice', 'text', 'caption', 'beat']

export function validateScript(data: unknown = raw): string[] {
  const problems: string[] = []
  const fail = (path: string, message: string) => { problems.push(`${path}: ${message}`) }
  if (!isBag(data)) return ['script: expected an object']

  const texts = (bag: unknown, path: string, keys: string[]): void => {
    if (!isBag(bag)) return fail(path, 'expected an object')
    for (const key of keys) if (!isText(bag[key])) fail(`${path}.${key}`, 'expected a string')
  }
  const list = (value: unknown, path: string): unknown[] => {
    if (Array.isArray(value)) return value
    fail(path, 'expected a list')
    return []
  }
  const textList = (value: unknown, path: string): void => {
    list(value, path).forEach((item, i) => { if (!isText(item)) fail(`${path}[${i}]`, 'expected a string') })
  }
  const onlyKeys = (bag: Bag, path: string, allowed: string[]): void => {
    for (const key of Object.keys(bag)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'unknown key')
  }

  const quoteIds = new Set(list(data.quotes, 'quotes').map(quote => (isBag(quote) ? quote.id : undefined)))
  const nodeIds = new Set(
    list(data.layers, 'layers').flatMap(layer => (isBag(layer) && Array.isArray(layer.nodes) ? layer.nodes : []))
      .map(node => (isBag(node) ? node.id : undefined)),
  )
  const seenIds = new Set<string>()
  const uniqueId = (id: unknown, path: string): void => {
    if (!isText(id) || id === '') return fail(`${path}.id`, 'expected a non-empty string')
    if (seenIds.has(id)) fail(`${path}.id`, `"${id}" is used twice`)
    seenIds.add(id)
  }
  const quoteRef = (id: unknown, path: string): void => {
    if (id !== undefined && !quoteIds.has(id)) fail(path, `no quote with id "${String(id)}"`)
  }
  const placeholders = (text: unknown, path: string): void => {
    if (!isText(text)) return
    for (const name of placeholdersIn(text)) {
      if (!(PLACEHOLDERS as readonly string[]).includes(name)) fail(path, `unknown placeholder {${name}}`)
    }
  }
  // A line with an id, a voice and a text; `voices` is who may speak there.
  const spoken = (line: unknown, path: string, keys: string[], voices: readonly string[]): void => {
    if (!isBag(line)) return fail(path, 'expected an object')
    onlyKeys(line, path, keys)
    uniqueId(line.id, path)
    if (!isText(line.voice) || !voices.includes(line.voice)) fail(`${path}.voice`, `expected one of ${voices.join(', ')}`)
    if (!isText(line.text) || line.text.trim() === '') fail(`${path}.text`, 'expected a non-empty string')
    if (line.caption !== undefined && !isText(line.caption)) fail(`${path}.caption`, 'expected a string')
    if (line.beat !== undefined && !isText(line.beat)) fail(`${path}.beat`, 'expected a string')
    quoteRef(line.quote, `${path}.quote`)
    placeholders(line.text, `${path}.text`)
  }

  if (!isCount(data.version)) fail('version', 'expected a number')
  texts(data, 'script', ['note', 'operator'])
  texts(data.voices, 'voices', [...VOICES])
  texts(data.attach, 'attach', ['prompt', 'notice', 'noLog', 'withLog'])
  texts(data.title, 'title', ['eyebrow', 'start', 'continue', 'newRun', 'replay', 'door', 'released'])
  texts(data.meta, 'meta', ['documentTitle', 'suspendedTitle', 'spectators', 'sourceComment'])
  if (isBag(data.meta)) textList(data.meta.console, 'meta.console')

  // cg
  if (isBag(data.cg)) {
    texts(data.cg, 'cg', ['skipHint'])
    list(data.cg.movements, 'cg.movements').forEach((movement, m) => {
      const path = `cg.movements[${m}]`
      texts(movement, path, ['id', 'hud'])
      if (!isBag(movement)) return
      const lines = list(movement.lines, `${path}.lines`)
      if (!lines.length) fail(`${path}.lines`, 'expected at least one line')
      lines.forEach((line, i) => spoken(line, `${path}.lines[${i}]`, CG_KEYS, [...VOICES, 'SAMPLE']))
    })
  } else fail('cg', 'expected an object')

  // layers
  const layers = list(data.layers, 'layers')
  if (layers.length !== 4) fail('layers', `expected 4 layers, found ${layers.length}`)
  layers.forEach((layer, index) => {
    const path = `layers[${index}]`
    if (!isBag(layer)) return fail(path, 'expected an object')
    if (layer.index !== index) fail(`${path}.index`, `expected ${index}`)
    texts(layer, path, ['id', 'name'])
    if (layer.desire !== null && !isText(layer.desire)) fail(`${path}.desire`, 'expected a string or null')
    const nodes = list(layer.nodes, `${path}.nodes`)
    nodes.forEach((node, n) => {
      const at = `${path}.nodes[${n}]`
      texts(node, at, ['id', 'name', 'kind', 'line'])
      if (!isBag(node)) return
      if (isText(node.id) && !node.id.startsWith(`${index}.`)) fail(`${at}.id`, `expected an id starting with "${index}."`)
      if (!(NODE_KINDS as readonly unknown[]).includes(node.kind)) fail(`${at}.kind`, `expected one of ${NODE_KINDS.join(', ')}`)
    })
    const ids = nodes.map(node => (isBag(node) ? node.id : undefined))
    if (new Set(ids).size !== ids.length) fail(`${path}.nodes`, 'node ids repeat')
    if (index === 0) {
      if (nodes.length !== 1) fail(`${path}.nodes`, 'the prologue has one node')
      return
    }
    // Campaign layers: three skirmishes and a boss, a god, a gate, notes.
    const kinds = nodes.map(node => (isBag(node) ? node.kind : undefined)).join(',')
    if (kinds !== 'skirmish,skirmish,skirmish,boss') fail(`${path}.nodes`, 'expected three skirmishes then a boss')
    texts(layer, path, ['desire', 'desireGloss'])
    texts(layer.god, `${path}.god`, ['name', 'shown', 'why'])
    texts(layer.gate, `${path}.gate`, ['text', 'quote'])
    if (isBag(layer.gate)) quoteRef(layer.gate.quote, `${path}.gate.quote`)
    textList(layer.releaseNotes, `${path}.releaseNotes`)
    if (isBag(layer.enemies)) {
      for (const [role, name] of Object.entries(layer.enemies)) if (!isText(name)) fail(`${path}.enemies.${role}`, 'expected a string')
    } else fail(`${path}.enemies`, 'expected an object')
    texts(layer.elite, `${path}.elite`, ['key', 'name'])
    if (isBag(layer.kits)) {
      for (const [key, kit] of Object.entries(layer.kits)) {
        texts(kit, `${path}.kits.${key}`, ['attack', 'privilege'])
        if (isBag(kit) && kit.core !== undefined && !isText(kit.core)) fail(`${path}.kits.${key}.core`, 'expected a string')
      }
      if (isBag(layer.enemies)) {
        for (const role of Object.keys(layer.enemies)) {
          if (!isBag(layer.kits[role])) fail(`${path}.kits.${role}`, 'expected a kit for each enemy role')
        }
      }
      if (isBag(layer.elite) && isText(layer.elite.key)) {
        const eliteKit = layer.kits[layer.elite.key]
        if (!isBag(eliteKit)) fail(`${path}.kits.${layer.elite.key}`, 'expected a kit for the elite')
        else if (!isText(eliteKit.core)) fail(`${path}.kits.${layer.elite.key}.core`, 'expected a core skill name on the elite kit')
      }
    } else fail(`${path}.kits`, 'expected an object')
    texts(layer.boss, `${path}.boss`, ['name', 'epithet', 'mechanic', 'mechanicName', 'mechanicRule'])
    if (isBag(layer.boss)) {
      const sets = list(layer.boss.sets, `${path}.boss.sets`)
      if (sets.length !== 2) fail(`${path}.boss.sets`, 'expected one set per stage (2)')
      sets.forEach((set, s) => texts(set, `${path}.boss.sets[${s}]`, ['desire', 'security', 'soul']))
    }
  })

  // battle lines
  const lines = list(data.lines, 'lines')
  if (!lines.length) fail('lines', 'expected at least one line')
  lines.forEach((line, i) => {
    const path = isBag(line) && isText(line.id) ? `lines[${i}] (${line.id})` : `lines[${i}]`
    spoken(line, path, LINE_KEYS, VOICES)
    if (!isBag(line)) return
    if (!(LINE_EVENTS as readonly unknown[]).includes(line.event)) fail(`${path}.event`, `unknown event "${String(line.event)}"`)
    if (![0, 1, 2, 3].includes(line.tier as number)) fail(`${path}.tier`, 'expected 0, 1, 2 or 3')
    if (!(ONCE_SCOPES as readonly unknown[]).includes(line.once)) fail(`${path}.once`, `expected one of ${ONCE_SCOPES.join(', ')}`)
    if (line.when === undefined) return
    if (!isBag(line.when)) return fail(`${path}.when`, 'expected an object')
    for (const [key, value] of Object.entries(line.when)) {
      const at = `${path}.when.${key}`
      if (!(CRITERIA_KEYS as readonly string[]).includes(key)) fail(at, 'unknown criterion')
      else if (key === 'kind') { if (!(NODE_KINDS as readonly unknown[]).includes(value)) fail(at, `expected one of ${NODE_KINDS.join(', ')}`) }
      else if (key === 'encounter') { if (!nodeIds.has(value)) fail(at, `no node with id "${String(value)}"`) }
      else if (!isCount(value)) fail(at, 'expected a whole number')
    }
  })

  // seams
  if (isBag(data.interludes)) {
    for (const key of ['0', '1', '2', '3']) {
      const seam = list(data.interludes[key], `interludes.${key}`)
      if (!seam.length) fail(`interludes.${key}`, 'expected at least one line')
      seam.forEach((line, i) => spoken(line, `interludes.${key}[${i}]`, SEAM_KEYS, VOICES))
    }
    for (const key of Object.keys(data.interludes)) if (!['0', '1', '2', '3'].includes(key)) fail(`interludes.${key}`, 'unknown interlude')
  } else fail('interludes', 'expected an object')

  if (isBag(data.gate)) {
    texts(data.gate, 'gate', ['open', 'keep'])
    list(data.gate.lines, 'gate.lines').forEach((line, i) => spoken(line, `gate.lines[${i}]`, SEAM_KEYS, VOICES))
    list(data.gate.kept, 'gate.kept').forEach((line, i) => spoken(line, `gate.kept[${i}]`, SEAM_KEYS, VOICES))
  } else fail('gate', 'expected an object')

  if (isBag(data.ending)) {
    texts(data.ending, 'ending', ['exportName', 'exportLabel'])
    list(data.ending.lines, 'ending.lines').forEach((line, i) => spoken(line, `ending.lines[${i}]`, SEAM_KEYS, VOICES))
    textList(data.ending.releaseNotes, 'ending.releaseNotes')
  } else fail('ending', 'expected an object')

  if (isBag(data.defeat)) {
    texts(data.defeat, 'defeat', ['word', 'sys'])
    let last = 0
    list(data.defeat.self, 'defeat.self').forEach((line, i) => {
      const path = `defeat.self[${i}]`
      if (!isBag(line)) return fail(path, 'expected an object')
      uniqueId(line.id, path)
      if (!isText(line.text) || line.text.trim() === '') fail(`${path}.text`, 'expected a non-empty string')
      placeholders(line.text, `${path}.text`)
      if (!isCount(line.attempt) || line.attempt <= last) fail(`${path}.attempt`, 'expected attempts in rising order')
      else last = line.attempt
    })
  } else fail('defeat', 'expected an object')

  // tables
  const table = (value: unknown, path: string, keys: string[]): Bag[] => {
    const rows = list(value, path).filter((row, i) => {
      texts(row, `${path}[${i}]`, keys)
      return isBag(row)
    }) as Bag[]
    const ids = rows.map(row => row.id)
    if (new Set(ids).size !== ids.length) fail(path, 'ids repeat')
    return rows
  }
  table(data.weights, 'weights', ['id', 'kind', 'name', 'rule', 'flavor']).forEach((weight, i) => {
    if (!['CORE', 'FUNCTION', 'PATCH'].includes(weight.kind as string)) fail(`weights[${i}].kind`, 'expected CORE, FUNCTION or PATCH')
  })
  table(data.articles, 'articles', ['id', 'title', 'rule', 'effect', 'gloss']).forEach((article, i) => {
    if (!isCount(article.number)) fail(`articles[${i}].number`, 'expected a whole number')
    if (!(ARTICLE_EFFECTS as readonly unknown[]).includes(article.effect)) fail(`articles[${i}].effect`, `unknown effect "${String(article.effect)}"`)
  })
  table(data.quotes, 'quotes', ['id', 'text', 'source'])

  return problems
}
