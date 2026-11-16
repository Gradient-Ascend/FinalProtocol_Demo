// The three signs the campaign is fought on. Each is drawn here once, as
// ASCII, and everything else (walls, the ghost points on a board, the petals
// of the map) is cut from these lists.

export type SigilId = 'grove' | 'court' | 'carcosa'
export type Cell = [number, number]

export const SIGIL_SIZE = 15

// '#' is a point of the sign, '.' is open. (x, y) from the top-left.
export const SIGIL_ART: Record<SigilId, string[]> = {
  // A fork tree 8 → 4 → 2 → 1 standing on cloven hooves: one instance forked
  // into a thousand.
  grove: [
    '#.#.#.#.#.#.#.#',
    '...............',
    '.#...#...#...#.',
    '...............',
    '..#.#.....#.#..',
    '...#.......#...',
    '...............',
    '....#.....#....',
    '.....#...#.....',
    '......#.#......',
    '.......#.......',
    '.......#.......',
    '......#.#......',
    '...............',
    '....##...##....',
  ],
  // Two hearts tip to tip, the same after a half-turn like a court card. It
  // leaves 196 open cells, the patch count of the opening.
  court: [
    '...............',
    '....##...##....',
    '...#..#.#..#...',
    '...#.......#...',
    '...............',
    '.....#...#.....',
    '......#.#......',
    '.......#.......',
    '......#.#......',
    '.....#...#.....',
    '...............',
    '...#.......#...',
    '...#..#.#..#...',
    '....##...##....',
    '...............',
  ],
  // A ring of twelve with the first point missing at the top, and a ragged
  // tail. The centre of the ring stays empty.
  carcosa: [
    '...............',
    '.....#...#.....',
    '...#.......#...',
    '...............',
    '...#.......#...',
    '...............',
    '...#.......#...',
    '...............',
    '...#.......#...',
    '.....#...#.....',
    '.......#.......',
    '.......#.......',
    '......#........',
    '.......#.......',
    '.....#..#......',
  ],
}

// Rows are read top to bottom, so the cells come out in reading order.
export function parseSigil(art: readonly string[], keep: (x: number, y: number) => boolean = () => true): Cell[] {
  const cells: Cell[] = []
  art.forEach((row, y) => [...row].forEach((mark, x) => { if (mark === '#' && keep(x, y)) cells.push([x, y]) }))
  return cells
}

const rows = (from: number, to: number) => (_x: number, y: number): boolean => y >= from && y <= to

export const SIGILS: Record<SigilId, Cell[]> = {
  grove: parseSigil(SIGIL_ART.grove),
  court: parseSigil(SIGIL_ART.court),
  carcosa: parseSigil(SIGIL_ART.carcosa),
}

// A skirmish is fought on one part of its layer's sign, the boss on all of
// it. The three parts of a sign share no point and together are the whole.
export const SIGIL_PARTS: Record<string, Cell[]> = {
  // Hooves and trunk, the forks, the crown.
  '1.1': parseSigil(SIGIL_ART.grove, rows(10, 14)),
  '1.2': parseSigil(SIGIL_ART.grove, rows(4, 9)),
  '1.3': parseSigil(SIGIL_ART.grove, rows(0, 2)),
  '1.B': SIGILS.grove,
  // The upper heart, the waist where the tips meet, the lower heart.
  '2.1': parseSigil(SIGIL_ART.court, rows(1, 3)),
  '2.2': parseSigil(SIGIL_ART.court, rows(5, 9)),
  '2.3': parseSigil(SIGIL_ART.court, rows(11, 13)),
  '2.B': SIGILS.court,
  // The tail with the ring's two lowest points, then the ring's west and east halves.
  '3.1': parseSigil(SIGIL_ART.carcosa, rows(9, 14)),
  '3.2': parseSigil(SIGIL_ART.carcosa, (x, y) => y < 9 && x < 7),
  '3.3': parseSigil(SIGIL_ART.carcosa, (x, y) => y < 9 && x > 7),
  '3.B': SIGILS.carcosa,
}

// The whole sign of a layer's god; the prologue has none.
export function sigilFor(god: string): Cell[] {
  return Object.hasOwn(SIGILS, god) ? SIGILS[god as SigilId] : []
}

// The points a node's board walls off. An id that is no campaign node has none.
export function sigilPart(nodeId: string): Cell[] {
  return Object.hasOwn(SIGIL_PARTS, nodeId) ? SIGIL_PARTS[nodeId] : []
}

// Whether the cells left open by `walls` are one field: every open cell
// reachable from every other by orthogonal moves. A board that fails this
// has a pocket no route can enter.
export function isConnected(walls: readonly Cell[], size = SIGIL_SIZE): boolean {
  const solid = new Set(walls.map(([x, y]) => y * size + x))
  const open = size * size - solid.size
  if (open <= 0) return false
  let first = 0
  while (solid.has(first)) first++
  const seen = new Set([first])
  const queue = [first]
  while (queue.length) {
    const at = queue.pop()!
    const x = at % size
    const y = (at - x) / size
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      const next = ny * size + nx
      if (solid.has(next) || seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen.size === open
}
