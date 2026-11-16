import { SIGILS } from '@/game/sigils'
import type { Cell, SigilId } from '@/game/sigils'
import { layerAt } from '@/story/script'

// What the shell needs to know about a layer that is not story text: its hue
// and which sign it carries. Names and lines come from script.json.
export const LAYER_HUES = ['#f5f5f5', '#9FCB6B', '#C4162E', '#FFC857'] as const
// The colour for small text about a layer. The Court's red is a field colour
// and too dark to read at ten pixels, so its text takes the Court's bone.
const LAYER_INKS = ['#f5f5f5', '#9FCB6B', '#F3EDE2', '#FFC857'] as const
const LAYER_SIGILS: (SigilId | null)[] = [null, 'grove', 'court', 'carcosa']

export function layerHue(layer: number): string {
  return LAYER_HUES[Math.max(0, Math.min(3, layer))]
}

export function layerInk(layer: number): string {
  return LAYER_INKS[Math.max(0, Math.min(3, layer))]
}

export function layerSigil(layer: number): Cell[] {
  const id = LAYER_SIGILS[layer]
  return id ? SIGILS[id] : []
}

// How a layer's god is written on screen. The first is withheld by the
// sandbox's filter, the second wears a different mask each time it is drawn,
// and the third has nothing to print: its slot shows what a tokenizer shows
// for a thing it cannot say. The real names in script.json are never used.
let draws = 0
export function godShown(layer: number): string {
  const god = layerAt(layer)?.god
  if (!god) return ''
  const pick = draws++
  if (god.masks?.length) return god.masks[pick % god.masks.length]
  const glitch = god.glitch?.filter(token => token.length > 0) ?? []
  return glitch.length ? glitch[pick % glitch.length] : god.shown
}
