# Data art, generative visuals and how to render them in a browser

## Summary

This dossier is the technique layer for the opening CG, the three-petal map and the sigils. It complements dossier 09 (what the models really do, the attention bake) and dossier 11 (shot content, sound, the awe beats), keeps their shot windows, and supplies what they leave open: one renderer and the transitions.

- **What to borrow.** From Ikeda: monochrome plus one accent, density of exact marks, and a single turn from 2D to 3D as the event of the piece [1][2]. From Henke: a tiny alphabet of primitives, one sound per visual event, afterimage as material [4]. From 3Blue1Brown and Bycroft: weight as dot size, vectors as visible columns of cells [5][6]. From Anadol: a camera that drifts inside a cloud [3]. From distill.pub: do not claim the cloud is a projection of real data [10]. Ikeda's strobing is excluded by the flash limits [24].
- **The governing idea.** A token is always a column of six dots. There is one token line. Text, 196 image tiles (197 with the class token) and 100 audio frames all land on it: 345 columns, 2,070 dots. In the last shot each dot sheds about ten points and the line becomes the surface of representation space. No cuts.
- **Attention as breath.** Five rules: rise in 120 ms and fall in 420 ms; delay the change by 14 ms per token of distance so it travels backwards; bloom only the strongest token, with 10% hysteresis; at most three faint arcs; a 4% resting breath every 4.2 s. Code is given.
- **Renderer.** A complete raw WebGL2 `gl.POINTS` program is given (about 300 lines, no dependencies): per-point staggered morph between shapes, divergence-free turbulence in mid-flight, interfering travelling waves, perspective with energy-conserving point size, soft round sprites, half-float trails, mip-chain bloom, tone curve and dither, context-loss recovery, resize, visibility pause and a reduced-motion cross-fade. It was type-checked and run in Chrome: 100,000 points held the display's 60 fps on one desktop GPU, and context loss and restore worked [L]. A Canvas 2D fallback for 4,000 to 6,000 points and shape generators (sheet, lattice, text, sigil, three petals) are included. No phone was tested.
- **Transitions.** Seven transitions are specified with windows, per-item flight time, stagger and easing: word to tokens, glyphs to columns, image to tiles, tiles to the line, audio frames to beads, line to cloud, mask and prediction.
- **Sigils.** On the 15 by 15 board every cell is a dot sized by its distance to the stroke (a halftone), breathing on a 6 s period with the phase running outward, ignited in stroke order at 45 ms per cell. As clouds, the same masks become thousands of points crowded on the strokes. Each god's petal differs in motion, not ornament.
- **Safety.** Design to two large-area flashes per second (the limit is three [24]); a gate function and a slew limiter are given.

## Findings

Citation keys: `[n]` is a web source read for this dossier (list at the end). `[L]` is a measurement or test made locally for this dossier on 2026-11-14 (method and results in C.7). `[D09]` and `[D11]` are the sibling dossiers `09-attention-multimodal-jepa-visualisation.md` and `11-awe-and-the-sublime-in-minimal-games.md` in this folder. "Unverified" marks anything not confirmed in a source that was actually read.

### A. What the reference works do, and what to take

Eight were chosen. Each entry: what the source says, then the transferable device.

**A.1 Ryoji Ikeda, datamatics and test pattern.**

- Ikeda's own page describes datamatics as a project about perceiving "the invisible multi-substance of data that permeates our world", made from "pure data as a source for sound and visuals" [1]. The concert imagery is "pared down black and white with striking colour accents" and moves from 2D patterns to rotating 3D views of the universe [1]. For data.tron the page says every pixel is "strictly calculated by mathematical principle" [1]. data.matrix is listed (2009, ten DLP projectors) but not described on the page [1].
- test pattern converts "any type of data (text, sounds, photos and movies)" into barcode and binary patterns; the images run at "some hundreds of frames per second" at points, and the stated aim is to probe the threshold of human perception and of the equipment [2].
- Take: (1) monochrome with a single accent colour, which is already the game's rule; (2) the 2D-to-3D turn as the one large event of a piece: the opening CG should stay flat for three shots and become spatial only in the fourth; (3) density as the source of awe: thousands of small exact marks, none decorative; (4) sound and image generated from the same numbers at the same instant.
- Do not take: the strobing. test pattern's full-field black and white alternation at high rates is the textbook case of what the flash limits in section F forbid.

**A.2 Refik Anadol, Unsupervised (Machine Hallucinations, MoMA).**

- The studio's page says the work processes 138,151 images from MoMA's archive, uses StyleGAN2 ADA, creates embeddings in 1,024 dimensions, and explores them with a custom "Latent Space Browser"; the moving image is a walk through the trained latent space [3]. For a related piece the page says UMAP was used to build a navigable space [3]. The page also states that the real-time work is too heavy to run in a web browser [3].
- Take: the camera that never stops drifting inside a cloud, and colour or brightness driven by local density.
- Do not take: the fluid, organic, pigment look. It fights the terminal chrome, and the game's budget is a vertex shader, not a GAN.

**A.3 Robert Henke, Lumière.**

- Henke describes laser drawing as limited by "the precise and fast movement of small mirrors", so richness is built from simple shapes: circles, squares, lines, dots, glyphs [4]. Each shape is bound to a note, giving "audiovisual notes"; persistence of vision makes controlled afterimages; high contrast against total darkness produces "negative objects" that look darker than black [4].
- Take: (1) a small alphabet of primitives (dot, line, ring) used for everything; (2) one sound per visual event, created at the same time by the same call; (3) afterimage as a material: the feedback trail in section C is the screen version; (4) dark shapes read as objects only when surrounded by light, which is exactly how the JEPA mask should read.

**A.4 3Blue1Brown, the attention lesson.**

- The attention pattern is drawn as a grid of dots where "bigger dots correspond to larger dot products"; after softmax each column sums to one; causal masking forces the entries for later tokens to zero; the grid grows with the square of the context length [5].
- Take: dot area as the encoding for weight (this is also a halftone, which links the attention grid to the sigils in section E), and the visible triangular zero region as a truthful picture of causality.

**A.5 Brendan Bycroft, LLM Visualization.**

- The repository describes "a 3D interactive model of a GPT-style LLM network running inference"; the working example is a tiny network that sorts the letters A, B and C, taken from Karpathy's minGPT [6]. Secondary write-ups give about 85,000 parameters and say green cells are numbers being processed and blue cells are weights [7] (search-result summaries; the live page did not render for the fetch tool, so these two details are unverified against the primary page).
- Take: every vector is a visible column of cells and nothing is hidden behind an icon. Section D adopts this: a token on screen is always a column of six dots.

**A.6 TensorFlow Embedding Projector, and distill.pub's t-SNE article.**

- The Projector is an interactive tool for visualising and interpreting embeddings [8]; TensorBoard's documentation says it lets users search for terms and highlights points adjacent in the embedding space [9].
- distill.pub's article on reading t-SNE warns that "you cannot see relative sizes of clusters in a t-SNE plot", that distances between well-separated clusters "may mean nothing", and that random noise can look structured [10].
- Take: a point cloud of representations is a familiar, legitimate image. The honesty rule that follows: the game's cloud is a metaphor drawn by a formula, not a projection of a real model's activations, so no caption or log line may call it a t-SNE, a UMAP or a "map of the latent space". [D09] section E makes the same point.

**A.7 Ryoichi Kurokawa, unfold.**

- The artist's page gives only the format: 2016, three-channel HD projection, 6.1 surround, a tactile transducer, an eight-minute loop [11]. The use of astrophysical data from CEA Irfu is widely reported but was not on the page read: unverified here.
- Take: the triptych. Three panels that hold one field and occasionally break it apart suit the three-petal map.

**A.8 Anders Hoff (inconvergent).**

- The site returned HTTP 403 to the fetch tool on two pages and the `sand-spline` README does not explain the method [12], so the following is from general knowledge and is unverified against his text: his plotter-like images are built by accumulating very many nearly transparent points along slightly perturbed curves, so that tone emerges from density.
- Take: accumulation. With additive blending, a dot's brightness should be low enough (0.05 to 0.3) that form appears only where many dots agree. This is what makes the dust around the sigil strokes in section E read as depth.

Not chosen: Memo Akten and demoscene intros were not researched within the source budget; nothing in this dossier depends on them.

### B. What the models really do (only the facts the transitions rely on)

- ViT: the paper's claim is that "a pure transformer applied directly to sequences of image patches can perform very well on image classification tasks", and its title states the patch size, 16 by 16 [13]. A 224 by 224 image cut into 16 by 16 patches gives 14 by 14 = 196 patches (arithmetic). The steps between patch and token (flatten, linear projection, position embedding, a prepended class token, making 197) are in the paper body and are documented with citations in [D09] section B; they were not re-read here.
- I-JEPA: from a single context block the model predicts the representations of several target blocks in the same image; target blocks should be of "sufficiently large scale" and the context block "sufficiently informative (spatially distributed)" [14].
- Audio at 12.5 frames per second means 80 ms per frame (arithmetic). The Moshi abstract confirms a theoretical latency of 160 ms [15]; the 12.5 Hz frame rate of its codec is documented in [D09] section C.1 and was not visible on the abstract page read here.

### C. Browser rendering facts

**C.1 WebGL practice (MDN).**

- Batch: "If you have 1000 sprites to paint, try to do it as a single `drawArrays()` or `drawElements()` call" [16].
- MDN lists `ALIASED_POINT_SIZE_RANGE: [1,100]` among the limits that can be relied on; anything beyond must be queried, not assumed [16]. The test machine reported 1 to 511 [L]; phones are often lower.
- Canvas size: the most reliable way to get the exact device-pixel size is `ResizeObserver` with `'device-pixel-content-box'`; resize inside the animation frame, because resizing clears the canvas and observer callbacks run after frame callbacks [16].
- Handle `webglcontextlost`; lose contexts eagerly with `WEBGL_lose_context` when finished; prefer `texStorage` in WebGL2; only request depth or stencil if used [16].
- `highp` in fragment shaders is not universal on old WebGL1 phones [16]. The program in this dossier targets WebGL2 and uses `highp` only in the post pass.

**C.2 Context loss (WebGL specification).**

- Restoration happens only if the application cancelled the lost event: the spec's steps abort "if the event's canceled flag is not set" [17]. After restoration, "WebGL resources such as textures and buffers that were created before the context was restored are no longer valid", and extensions must be re-enabled [17]. MDN shows the loss can be simulated with `getExtension("WEBGL_lose_context").loseContext()` [18].

**C.3 Additive drawing on a 2D canvas.** `globalCompositeOperation = 'lighter'`: "Where both shapes overlap, the color is determined by adding color values" [19]. The game's attack effects already use this plus a quarter-resolution blurred copy for bloom (`app/src/game/attack-fx.ts`, lines 598 to 690) [L].

**C.4 Bloom.** The standard pipeline is: extract bright parts, blur them with a separable Gaussian run as alternating horizontal and vertical passes between two framebuffers, add the result to the scene, then tone-map with `1 - exp(-colour * exposure)` [20]. The tutorial's five weights are 0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216 [20]. It blurs at full resolution; blurring a downsampled copy is the usual cheaper variant (not in that source).

**C.5 Dithering.** Mikkel Gjoel (Playdead) advises adding noise in the final shader output before the 8-bit write: triangular noise of 2 LSB total amplitude, made by adding two uniform random numbers; he notes the eye "is very robust against noise in dark areas, which we barely notice" while it readily finds banding edges there, and that blending happens at render-target precision, so dither added before an 8-bit blend can be quantised away [21].

**C.6 Curl noise.** Bridson, Hourihan and Nordenstam (SIGGRAPH 2007) build a velocity field as the curl of a potential, which makes it divergence-free by construction: particles do not bunch into sinks or thin out from sources. The paper's PDF could not be parsed by the fetch tool, so this is from the abstract as returned by search [22]. Philip Rideout's write-up confirms the practical recipe: keep the potential smooth, evaluate the curl with central differences (step 1e-4), sum about three octaves of Perlin noise, and blend toward obstacles with a ramp of distance [23].

**C.7 Measured here [L].** The program in the next section was type-checked with the project's TypeScript (strict), bundled, and run in Chrome (ANGLE Metal, Apple M4) through Playwright:

| Test | Result |
| --- | --- |
| Shaders compile and link; `gl.getError()` after 2 s | no error |
| 20,000 points, wave, 1280 by 720 buffer, trails and bloom on | median frame 16.7 ms, 95th percentile 16.7 ms (display-limited) |
| 100,000 points, same, idle and mid-morph | median 16.7 ms, 95th percentile 16.8 ms |
| `loseContext()` then `restoreContext()` | 1 lost event, 1 restored event, drawing resumed, no GL error |
| `prefers-reduced-motion: reduce` emulated | morph renders as a cross-fade in place, no GL error |
| Shapes rendered and inspected | wave sheet, lattice, text, single sigil, three-petal map |
| Canvas 2D fallback, `fillRect` per point, 1280 by 720 | 4,000 points 1.8 ms; 12,000 points 3.7 ms (script time only) |

Limits: one desktop GPU; no phone was tested; frame times are capped by the 60 Hz display, so they show "not slower than 60 fps", not headroom. Playwright's device-scale emulation does not change `devicePixelContentBoxSize`, so the buffer was 1280 by 720, not 2560 by 1440. [D09] E.3 has throttled-CPU figures for the 2D paths that agree with these.

### D. Safety facts

- WCAG 2.3.1 passes content that does "not contain anything that flashes more than three times in any one second period", or whose flashes are below the general and red thresholds [24]. A general flash is a pair of opposing changes in relative luminance of 10% or more of maximum where the darker image is below 0.80; a red flash involves saturated red, working definition R/(R+G+B) of at least 0.8 [24]. Flashing confined to a small area is exempt: under 25% of any 10-degree visual field, approximated on the web as a 341 by 256 CSS-pixel rectangle [24].
- `prefers-reduced-motion: reduce` reports that the user has asked the system to minimise non-essential motion; MDN names "scaling or panning large objects" as vestibular triggers [25].
- Most browsers stop `requestAnimationFrame` callbacks in background tabs, and `visibilitychange` with `document.hidden` reports the state; tabs playing audio are treated as foreground and are not throttled [26]. So the CG must pause its own audio clock when hidden; the browser will not.

## Art direction and implementation for Final Protocol

This section is the technique layer under [D11] section 1 (shot content, sound, the "tremble" beats) and [D09] sections E and F (what is true about the models, the bake pipeline). It keeps their shot windows (text 4 to 30 s, image 30 to 50 s, audio 50 to 70 s, representation space 70 to 100 s) and specifies what they leave open: one renderer for every cloud, and the transitions that make four shots one movement. Where a number here differs from [D11], the difference is stated.

All code below was type-checked under `strict` and run in Chrome [L] unless marked "sketch". Colours: background `#070707`, white `#f5f5f5`, player blue `#5ee6ff`. Lengths are CSS pixels unless stated; `W` and `H` are the stage width and height.

### 1. The governing idea: one token line, one cloud

Three decisions make the CG continuous.

1. **A token is always a column of six dots.** Text tokens, image patches and audio frames all end as the same glyph: a vertical column of six dots at pitch `p`, each dot's brightness one number. This is the Bycroft rule (vectors are visible cells [6]) and the 3Blue1Brown rule (dot area or brightness carries the value [5]). It is also true to the mechanism: after embedding, the model no longer knows which sense a token came from; it has a row of vectors.
2. **There is one token line.** Every modality lands on the same band and extends it to the right. Nothing gets its own track. ([D11] stacks three rows; treat those as the same sequence wrapped onto several rows on narrow screens, as defined below.)
3. **The cloud is made of the band.** In shot 4 each of the band's dots sheds about ten points and the whole band becomes the surface. No cut, no fade to black, from the first subtitle to the title.

**Band layout.** Columns: 48 text tokens (replace with the real count of the final subtitle line), 197 image tokens (class token plus 196 patches), 100 audio frames (8.0 s at 12.5 per second). Total `C = 345` columns, 2,070 dots.

```
p     = clamp(floor(0.86 * W / C), 2, 6)            // dot pitch; 3 px at W = 1280
rows  = p * C <= 0.86 * W ? 1 : ceil(2 * C / (0.86 * W))   // wrap at pitch 2 on narrow screens; 3 rows at W = 390
x(c)  = 0.07 * W + (c mod perRow) * p               // perRow = ceil(C / rows)
y(c,j)= 0.66 * H + floor(c / perRow) * 9 * p + j * p,  j = 0..5
dot   = square of side max(1, p - 1), alpha 0.15 + 0.85 * v(c, j)
```

`v(c, j)` is the j-th of six numbers for token `c`. If the bake pipeline of [D09] F.1 is built, export six real numbers per token (for example the first six principal components of its final-layer state, scaled to 0..1). If not, use a fixed hash of the token id and `j`, and do not describe the dots as real anywhere in the game.

**Transition table.** Times are seconds from the start of the CG.

| # | Transition | Window | Per-item flight | Stagger | Easing | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Word splits into tokens | on each word's arrival, 4.0 to 24.0 | 0.24 | 0.018 per token | easeOutCubic | gap appears with no motion |
| T2 | Glyphs condense into columns, columns drop to the band | 28.6 to 30.0 | 0.90 | 0.010 per token | easeInOutCubic | cross-fade 0.6 |
| T3 | Image is cut into 196 tiles | 32.0 to 33.2 | 0.30 line, 0.50 gap | 0.012 per line | easeOutCubic | lines appear, no gap motion |
| T4 | Tiles flatten into the band | 44.0 to 47.3 | 0.90 | 0.012 per tile | easeInOutCubic, with a lift | tiles fade out, columns fade in, same stagger |
| T5 | 80 ms frames lift out as beads and join | 62.0 to 65.6 | 0.20 lift, 0.08 hold, 0.80 flight | 0.025 per frame | easeOutCubic, then easeInOutCubic | same as T4 |
| T6 | The band becomes the cloud | 70.0 to 75.0 | 2.0 | 3.0 across the band, left to right | smootherstep, curl turbulence 0.45 | cross-fade, no flight (built into the shader) |
| T7 | Mask, then prediction | 78.0 to 88.0 | 1.2 mask, 1.0 per predicted point | by distance from the mask edge | exponential approach | four held steps [D11] |

```ts
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3
const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const easeInOutSine = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k)
const smoother = (k: number) => k * k * k * (k * (6 * k - 15) + 10)
/** Local clock of item i in a staggered move: 0 before its start, 1 after its end. */
const local = (t: number, start: number, i: number, stagger: number, flight: number) =>
  Math.min(1, Math.max(0, (t - start - i * stagger) / flight))
```

### 2. Shot 1: words become tokens; attention as breath

**T1, the split.** A word arrives whole, at the subtitle's reading position. After 120 ms it separates at its real token boundaries: each piece after the first moves right by `0.28 em * its index within the word` over 0.24 s (easeOutCubic), pieces 18 ms apart. A 1 px underline, 20% white, draws under each piece. The token id appears below it in 9 px type at 35% white for 0.6 s, then fades over 0.3 s. Leading-space tokens keep their space inside the piece, as real tokenisers do ([D09] A.4). The ids are the "a little meta" touch: for under a second the player sees what the text is to the thing reading it.

**Attention as breath.** The data is one row of weights per new token ([D09] A.5 and F). Five rules turn a chart into breathing; all five are in the class below.

1. *Asymmetric time constants.* Brightness rises with a 120 ms time constant and falls with 420 ms. Inhale is quick, exhale slow. A symmetric ease reads as a dimmer switch.
2. *Lag by distance.* The new weights reach a token `14 ms * (distance in tokens)` after they arrive, capped at 280 ms. The change is seen to travel backwards from the newest token, which is the direction attention looks.
3. *Bloom only on the strongest token*, with hysteresis: the glow moves only when another token's weight exceeds the current holder's by 10%, and cross-fades over 200 ms. Without hysteresis the glow chatters between near-equal tokens.
4. *At most three arcs.* From the newest token to its three most attended tokens, only those with weight at least 0.08: a 1 px quadratic arc above the line, height `min(0.9 * lineHeight, 0.18 * dx + 6)`, alpha `0.35 * shown`, drawn from the new token backwards over 0.3 s, held 0.3 s, faded over 0.5 s.
5. *A resting breath.* The whole paragraph's alpha is multiplied by `1 + 0.04 * sin(2 pi t / 4.2)`: one cycle per 4.2 s, about fourteen per minute. Under 5% it is felt, not seen.

The brightness map is [D11]'s: `alpha = 0.10 + 0.90 * (w / wMax) ^ 0.6`. No token moves; position is reserved for the transitions.

```ts
// breath.ts -- attention weights shown as breath: fast in, slow out, a ripple that travels back from the newest token.
export type Tok = { x: number; y: number; w: number; text: string; shown: number; glow: number }

export class AttentionBreath {
  private strongest = -1
  private clock = 0
  private arrived = 0                                   // time the current row of weights arrived
  private target: Float32Array = new Float32Array(0)
  constructor(public toks: Tok[]) {}

  /** `row` = attention from the newest token to every earlier token (sums to 1). */
  attend(row: Float32Array) { this.target = row; this.arrived = this.clock }

  step(dt: number) {
    this.clock += dt
    const n = Math.min(this.toks.length, this.target.length), head = n - 1
    let max = 1e-6, arg = 0
    for (let i = 0; i < n; i++) if (this.target[i] > max) { max = this.target[i]; arg = i }
    if (this.strongest < 0 || this.strongest >= n || this.target[arg] > 1.1 * this.target[this.strongest]) this.strongest = arg   // hysteresis
    for (let i = 0; i < n; i++) {
      const t = this.toks[i]
      const lag = Math.min(0.28, 0.014 * (head - i))    // 14 ms per token of distance, capped
      if (this.clock - this.arrived < lag) continue      // the ripple has not reached this token yet
      const goal = 0.10 + 0.90 * (this.target[i] / max) ** 0.6
      const tau = goal > t.shown ? 0.12 : 0.42           // inhale 120 ms, exhale 420 ms
      t.shown += (goal - t.shown) * (1 - Math.exp(-dt / tau))
      t.glow += ((i === this.strongest ? 1 : 0) - t.glow) * (1 - Math.exp(-dt / 0.2))
    }
  }

  draw(ctx: CanvasRenderingContext2D, font: string, lineHeight: number) {
    const n = Math.min(this.toks.length, this.target.length), head = this.toks[n - 1]
    const rest = 1 + 0.04 * Math.sin(6.2831853 * this.clock / 4.2)   // whole paragraph: one breath per 4.2 s
    ctx.font = font; ctx.textBaseline = 'alphabetic'
    for (let i = 0; i < n; i++) {
      const t = this.toks[i]
      if (t.glow > 0.02) {                               // bloom on the strongest token only
        ctx.save(); ctx.globalCompositeOperation = 'lighter'
        ctx.shadowColor = `rgba(255,255,255,${(0.55 * t.glow).toFixed(3)})`; ctx.shadowBlur = lineHeight * 0.45
        ctx.fillStyle = `rgba(255,255,255,${(0.35 * t.glow).toFixed(3)})`; ctx.fillText(t.text, t.x, t.y); ctx.restore()
      }
      ctx.fillStyle = `rgba(245,245,245,${Math.min(1, t.shown * rest).toFixed(3)})`
      ctx.fillText(t.text, t.x, t.y)
    }
    if (!head) return
    const order = Array.from({ length: n - 1 }, (_, i) => i).sort((a, b) => this.target[b] - this.target[a]).slice(0, 3)
    const age = this.clock - this.arrived
    ctx.lineWidth = 1
    for (const i of order) {                             // at most three faint arcs, drawn from the newest token backwards
      if (this.target[i] < 0.08) continue
      const a = this.toks[i], x0 = head.x + head.w / 2, x1 = a.x + a.w / 2, y0 = head.y - lineHeight * 0.8, y1 = a.y - lineHeight * 0.8
      const lift = Math.min(lineHeight * 0.9, 0.18 * Math.abs(x1 - x0) + 6)
      const grow = Math.min(1, age / 0.3), fade = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.5)
      const len = Math.hypot(x1 - x0, y1 - y0) + 2 * lift
      ctx.setLineDash([len * (1 - (1 - grow) ** 3), len])
      ctx.strokeStyle = `rgba(245,245,245,${(0.35 * this.toks[i].shown * fade).toFixed(3)})`
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - lift, x1, y1); ctx.stroke()
    }
    ctx.setLineDash([])
  }
}
```

**T2, glyphs to columns (28.6 to 30.0).** After [D11]'s pull-back to the attention matrix, the row the player was reading descends to the band.

- Sample each token's glyphs into points: draw the token on an offscreen canvas, read the pixels with `getImageData`, keep those with alpha above 96, pick 42 at random (seven per column dot). The function `text()` in section 5 is this sampler.
- Point `q` of token `c` belongs to column dot `j = q mod 6`. Its position is `lerp(glyphPos, dotPos(c, j), easeInOutCubic(k))` with `k = local(t, 28.6, c, 0.010, 0.90)`. Its size goes from 1 px to `p - 1`; its alpha from the token's shown alpha to `0.15 + 0.85 * v(c, j)`.
- At `k = 1` the seven points of a dot coincide; draw one square instead from then on.
- 48 tokens by 42 points is 2,016 `fillRect` calls for 1.4 s, inside the 2D budget [L].
- Sound, per [D11]'s scale: each column's arrival is a 30 ms sine tick; the 48 ticks at 10 ms spacing fuse into a short rising buzz at 100 Hz. That is the first moment text is heard as rate, which prepares the audio shot.

### 3. Shot 2: the image becomes 196 tokens

**Layout.** Image square side `S = min(0.56 * H, 0.80 * W)`, centred at `(0.5 * W, 0.36 * H)`. The band stays visible below at `0.66 * H` with its 48 text columns lit at 40%.

**T3, the cut (32.0 to 33.2).** Thirteen vertical and thirteen horizontal hairlines (1 px, 30% white) draw across the image, each in 0.30 s, 12 ms apart, vertical first. Then the tiles separate: tile `(r, c)` moves by `((c - 6.5) * g, (r - 6.5) * g)` with `g = 3 px` over 0.50 s (easeOutCubic). The hairlines fade as the gaps open, because the gaps now do their job.

**Attention (33.2 to 44.0).** As [D11]: each tile gets an additive white square at alpha `0.85 * w ^ 0.6`, following its weight with the same 120 / 420 ms breath as text. The class token is drawn as one column of six dots just outside the top-left corner of the image, with a 10 px label `[CLS]`. Its 1 px line to the most attended tile uses the hysteresis rule.

**T4, the flatten (44.0 to 47.3).** This is the shot's statement and must be exact about what a ViT does.

1. *Position (43.4 to 44.0).* Each tile shows its index, 0 to 195, in 8 px type at 40% white for 0.3 s, raster order, 3 ms apart. The model adds a position to each patch before it forgets the grid; show that it was told.
2. *Projection (first 40% of each tile's flight).* The picture inside the tile cross-fades to six horizontal bands whose brightnesses are `v(c, j)`. The tile is now a vector. Do not reduce a tile to its mean grey: a patch becomes many numbers, not one.
3. *Flight.* Tile `i` (raster order) has `k = local(t, 44.0, i, 0.012, 0.90)`, `e = easeInOutCubic(k)`.

```
pos  = lerp(tilePos, columnPos(49 + i), e) + (0, -0.06 * H * sin(pi * e))    // lifts, then lands
w    = lerp(S / 14, p - 1, e)        h = lerp(S / 14, 6 * p, e)             // square becomes a column
```

4. The class token's column lands first, at column 48, 0.2 s before tile 0. The image occupies columns 48 to 244.
5. As the last tile lands (47.3 s) the empty outline of the 14 by 14 grid remains at 8% white for 1.5 s, then fades. The picture is gone; its order survives only as the indices the tiles carried.

Total 196 moving rectangles: trivial for the 2D canvas.

### 4. Shot 3: 80 ms frames become beads

**Layout.** Waveform across `0.86 * W` at `y = 0.36 * H`, half-height `0.09 * H`, showing 8.0 s: 100 frames, each `0.0086 * W` wide (11 px at `W = 1280`). Hairlines at every frame boundary, 12% white.

**Timing.** 50.0 to 52.0 the waveform draws left to right (four times real speed). 52.0 to 53.0 the frame hairlines drop in from above, 8 ms apart, 0.2 s each. 53.0 to 62.0 attention fills the frame columns ([D11] shot 3; same breath constants). The scrolling live signal of [D11] continues until 61.0, then freezes: the lift needs a still object.

**T5, the lift (62.0 to 65.6).** Frame `i`, left to right, start `62.0 + 0.025 * i`:

1. *Lift, 0.20 s, easeOutCubic.* The frame's slice of waveform rises `0.03 * H`, leaving a gap in the line. 0.025 s stagger is deliberately shorter than a frame's real 0.08 s, so the lifting runs along the line about three times faster than the sound did.
2. *Hold, 0.08 s.* One frame's real duration. During the hold the slice's polyline collapses vertically into six dots: dot `j` takes brightness `v(c, j)`. (A neural codec turns each frame into a small stack of discrete codes; see [D09] C. Six dots stand for that stack.)
3. *Flight, 0.80 s, easeInOutCubic,* to column `245 + i` with the same lift term as T4 at half height (`0.03 * H`).

Each landing is a 20 ms tick; at 25 ms spacing the ticks form a 40 Hz flutter under the voices. When frame 99 lands the band is complete: 345 columns. Hold 1.5 s. All 2,070 dots take one shared breath (alpha times 1.2 for 0.4 s, eased), which is [D11]'s "both rows brighten together".

### 5. Shot 4 and the renderer: the band becomes representation space

#### 5.1 Canvas 2D or WebGL2

| | Canvas 2D | Raw WebGL2 `gl.POINTS` |
| --- | --- | --- |
| Where the maths runs | JavaScript, every point, every frame | vertex shader; the buffer is uploaded once per morph |
| Practical ceiling at 60 fps | about 6,000 `fillRect` points; about 20,000 with an `ImageData` splat ([D09] E.3) | 100,000 ran at the display's 60 fps here [L] |
| Round soft dots | costs an `arc` or a sprite `drawImage` per point | free: shaped in the fragment shader from `gl_PointCoord` |
| Additive | `'lighter'` [19] | `blendFunc(ONE, ONE)` |
| Bloom | blurred quarter-size copy, as `attack-fx.ts` does | mip chain of the scene texture, one extra pass |
| Trails | translucent black fill each frame; leaves 8-bit residue | multiply a half-float buffer by a decay factor: fades cleanly |
| Failure modes | none | context loss; point-size caps; no WebGL2 on old devices |
| Use for | shots 1 to 3, the board, the map at rest, the fallback | shot 4, map reveals, boss sigils as clouds |

[D09] recommends Canvas 2D for the final shot because 20,000 points fit. That holds. The reason to use WebGL2 anyway is not the wave; it is the morph. Staggered flight with turbulence for every point, round sprites, trails that fade to true black and a dithered output cost nothing on the GPU and are what the director's brief asks for. Ship both: WebGL2 at 20,000 to 60,000 points, the 2D fallback at 4,000 to 6,000.

#### 5.2 The complete WebGL2 program

One class. One interleaved buffer of 11 floats per point: where the point is coming from, where it is going, and three random numbers. Everything that moves is computed in the vertex shader.

How it works:

- **Morph.** `uMorph` runs 0 to 1 over `duration`. Each point has its own clock `k = clamp(uMorph * (1 + S) - delay * S, 0, 1)` where `S` is the stagger and `delay` is 0 to 1. A point's own flight lasts `duration / (1 + S)`; the last point starts at `duration * S / (1 + S)`. Position is `mix(from, to, smootherstep(k))`.
- **Turbulence.** A displacement `uTurb * 4k(1 - k) * curl(pos)` is added: zero at both ends, largest mid-flight, so shapes are exact at rest and the journey between them swirls. The field is the analytic curl of the potential `(sin(y + t) + cos z, sin(z + t) + cos x, sin(x + t) + cos y)`, two octaves. Its divergence is exactly zero, which is Bridson's principle [22] without Perlin noise or finite differences [23]; it costs six trigonometric calls. Strictly, curl noise is a velocity to integrate; using it as a displacement is a stateless approximation that looks the same at these amplitudes (up to about 0.6 units).
- **Travelling waves.** Two circular sources with fall-off and one plane wave, the same sources and constants as [D09] E.2 so the two dossiers describe one surface. `uWaveFrom` and `uWaveTo` say how strongly the start and target shapes ride the wave (1 for the sheet, 0 for a sigil or text).
- **Perspective and size.** `gl_PointSize = pointSize * f * H / (2w)` device pixels, clamped to 1 and to the queried maximum. A point that would be smaller than one pixel is drawn at one pixel with its brightness multiplied by `s^2`, so distant points dim smoothly and do not pop or crawl.
- **Sprite.** `exp(-3.5 d^2)` with a smooth cut-off at the edge; no texture.
- **Trails.** The scene is drawn into a half-float texture that is not cleared: each frame it is multiplied by `exp(-dt / trail)`, then the points are added. Half-float matters: in 8 bits, `value * 0.9` rounds back to the same value at low levels and leaves a permanent grey ghost. If `EXT_color_buffer_float` is missing, the class uses 8 bits and turns trails off.
- **Bloom.** `generateMipmap` on the scene texture, then the post pass adds mip levels 2 to 5. It is not a true Gaussian [20] and shows faint blockiness on single bright points against black if `bloom` is pushed past about 1.5; at the values here it is not visible. A two-pass separable blur at quarter resolution with the five weights in C.4 is the upgrade.
- **Tone and dither.** `bg + (1 - bg) * (1 - exp(-exposure * hdr))` gives a soft shoulder [20], so dense areas saturate gracefully. Triangular noise of plus or minus one 8-bit step is added last [21].
- **Robustness.** Context loss cancels the default (required for restoration [17]), stops the loop, and rebuilds every GL object from the CPU copy on restore. Size comes from `ResizeObserver` with `device-pixel-content-box` and is applied inside the frame [16]. Device pixel ratio is capped at 2 and the buffer at 2.5 megapixels. The loop stops when the tab is hidden [26]. `prefers-reduced-motion` [25] switches the morph to a cross-fade in place, removes turbulence, drift, trails and camera yaw, and slows the wave to a quarter.

```ts
// point-field.ts -- one morphing point cloud on raw WebGL2. No dependencies.
// Layout per point (11 floats): from.xyz, from.brightness, to.xyz, to.brightness, phase, delay, size.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec4 aFrom;   // xyz, brightness
layout(location=1) in vec4 aTo;     // xyz, brightness
layout(location=2) in vec3 aSeed;   // phase 0..1, delay 0..1, size factor
uniform mat4 uViewProj;
uniform float uTime, uMorph, uStagger, uTurb, uDrift, uWaveFrom, uWaveTo;
uniform float uPointScale, uMaxPoint, uFog, uReduced;
out float vAlpha;

// Two circular sources with fall-off plus one plane wave: travelling, interfering.
float wave(vec2 p, float t) {
  float r1 = length(p - vec2(-1.6, -0.8));
  float r2 = length(p - vec2( 2.1,  1.2));
  return 0.55 * sin(2.4 * r1 - 1.7 * t) / (1.0 + 0.35 * r1)
       + 0.40 * sin(3.1 * r2 - 1.7 * t) / (1.0 + 0.35 * r2)
       + 0.12 * sin(dot(p, vec2(0.8, 1.9)) + 1.1 * t);
}
// Curl of the potential (sin(y+t)+cos z, sin(z+t)+cos x, sin(x+t)+cos y): divergence is exactly 0.
vec3 curl1(vec3 p, float t) { return -sin(p.yzx) - cos(p.zxy + t); }
vec3 curl(vec3 p, float t) { return curl1(p, t) + 0.5 * curl1(p * 2.03 + 17.0, t * 1.3); }

void main() {
  float k = clamp(uMorph * (1.0 + uStagger) - aSeed.y * uStagger, 0.0, 1.0);  // per-point clock
  float e = k * k * k * (k * (6.0 * k - 15.0) + 10.0);                        // smootherstep
  float fade = 1.0;
  if (uReduced > 0.5) { fade = abs(2.0 * k - 1.0); e = step(0.5, k); }        // cross-fade, no flight
  vec3 pos = mix(aFrom.xyz, aTo.xyz, e);
  pos.y += mix(uWaveFrom, uWaveTo, e) * wave(pos.xz, uTime);
  float bell = 4.0 * k * (1.0 - k);                                           // 0 at both ends
  pos += (uTurb * bell * (1.0 - uReduced) + uDrift) * curl(pos * 0.9 + aSeed.x * 0.6, uTime * 0.25);
  gl_Position = uViewProj * vec4(pos, 1.0);
  float w = max(gl_Position.w, 0.05);
  float s = uPointScale * aSeed.z / w;                                        // diameter in device px
  gl_PointSize = clamp(s, 1.0, uMaxPoint);
  float energy = min(1.0, s * s);                                             // sub-pixel points dim, not vanish
  float breath = 0.85 + 0.15 * sin(6.2831853 * (aSeed.x + 0.11 * uTime));
  vAlpha = mix(aFrom.w, aTo.w, e) * exp(-uFog * w) * energy * breath * fade;
}`

const FRAG = `#version 300 es
precision mediump float;
uniform vec3 uColor;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  float a = exp(-3.5 * d2) * smoothstep(1.0, 0.6, d2);   // soft round sprite, no texture
  outColor = vec4(uColor * (vAlpha * a), 1.0);            // premultiplied; blended ONE, ONE
}`

const QUAD = `#version 300 es
void main() {                                             // one triangle covering the screen, no buffer
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FADE = `#version 300 es
precision mediump float;
uniform float uDecay;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, uDecay); }   // blended ZERO, SRC_ALPHA: dst *= uDecay`

const POST = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec3 uBg;
uniform float uBloom, uExposure, uTime;
out vec4 outColor;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 sharp = textureLod(uScene, uv, 0.0).rgb;
  vec3 glow = 0.40 * textureLod(uScene, uv, 2.0).rgb + 0.30 * textureLod(uScene, uv, 3.0).rgb
            + 0.20 * textureLod(uScene, uv, 4.0).rgb + 0.10 * textureLod(uScene, uv, 5.0).rgb;
  vec3 hdr = sharp + uBloom * glow;
  vec3 col = uBg + (1.0 - uBg) * (1.0 - exp(-uExposure * hdr));              // soft shoulder, never clips
  float n = hash(gl_FragCoord.xy + fract(uTime) * 61.0) + hash(gl_FragCoord.yx + fract(uTime) * 37.0) - 1.0;
  col += n / 255.0;                                                           // triangular dither, +-1 LSB
  outColor = vec4(col, 1.0);
}`

export type Morph = {
  duration?: number      // seconds for the slowest point's own flight plus the stagger window
  stagger?: number       // 0..3: how much of the timeline is spent waiting for delayed points
  turbulence?: number    // world units of curl displacement at mid-flight
  wave?: number          // 0..1: how much the travelling waves displace the target shape in y
  delay?: (x: number, y: number, z: number, i: number) => number   // 0..1 per point; default random
}
export type FieldOptions = {
  color?: [number, number, number]; background?: [number, number, number]
  pointSize?: number; bloom?: number; exposure?: number; trail?: number; fog?: number; drift?: number
  maxDpr?: number; maxPixels?: number
}

export class PointField {
  readonly count: number
  private gl: WebGL2RenderingContext
  private data: Float32Array                     // CPU copy, so a lost context can be rebuilt
  private rnd: Float32Array                      // per-point random delay, fixed for the field's life
  private o: Required<FieldOptions>
  private prog!: WebGLProgram; private fadeProg!: WebGLProgram; private postProg!: WebGLProgram
  private vao!: WebGLVertexArrayObject; private vbo!: WebGLBuffer
  private fbo: WebGLFramebuffer | null = null; private tex: WebGLTexture | null = null
  private uni = new Map<string, WebGLUniformLocation | null>()
  private hdr = false; private maxPoint = 64
  private raf = 0; private last = 0; private time = 0
  private morph = 1; private dur = 1; private stagger = 0; private turb = 0; private waveFrom = 0; private waveTo = 0
  private w = 0; private h = 0; private wantW = 0; private wantH = 0
  private ro: ResizeObserver
  private reduced = matchMedia('(prefers-reduced-motion: reduce)')
  camera = { yaw: 0, yawSpeed: 0.05, pitch: 0.33, distance: 8.2, fov: 0.7, target: [0, 0.2, 0] as [number, number, number] }

  constructor(private canvas: HTMLCanvasElement, count: number, options: FieldOptions = {}) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('webgl2 unavailable')          // caller falls back to drawPoints2D
    this.gl = gl
    this.count = count
    this.data = new Float32Array(count * 11)
    this.rnd = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      this.rnd[i] = Math.random()
      this.data[i * 11 + 8] = Math.random()                 // phase
      this.data[i * 11 + 10] = 0.7 + 0.6 * Math.random()    // size factor
    }
    this.o = { color: [1, 1, 1], background: [0.027, 0.027, 0.027], pointSize: 0.035, bloom: 0.9, exposure: 1.4,
      trail: 0.12, fog: 0.09, drift: 0.012, maxDpr: 2, maxPixels: 2_500_000, ...options }
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.ro = new ResizeObserver(entries => {
      const e = entries[entries.length - 1]
      const box = e.devicePixelContentBoxSize?.[0]
      const dpr = Math.min(devicePixelRatio || 1, this.o.maxDpr)
      let w = box ? box.inlineSize : Math.round(e.contentRect.width * (devicePixelRatio || 1))
      let h = box ? box.blockSize : Math.round(e.contentRect.height * (devicePixelRatio || 1))
      const scale = Math.min(1, dpr / (devicePixelRatio || 1), Math.sqrt(this.o.maxPixels / Math.max(1, w * h)))
      w = Math.max(1, Math.floor(w * scale)); h = Math.max(1, Math.floor(h * scale))
      this.wantW = w; this.wantH = h                        // applied inside the frame, never here
    })
    try { this.ro.observe(canvas, { box: 'device-pixel-content-box' }) } catch { this.ro.observe(canvas) }
    this.wantW = canvas.width; this.wantH = canvas.height
    this.build()
    this.start()
  }

  /** Current target becomes the start; `shape` (xyz + brightness per point) becomes the new target. */
  setTarget(shape: Float32Array, m: Morph = {}) {
    const d = this.data, n = this.count
    for (let i = 0; i < n; i++) {
      const o = i * 11, k = Math.min(1, Math.max(0, this.morph * (1 + this.stagger) - d[o + 9] * this.stagger))
      const e = k * k * k * (k * (6 * k - 15) + 10)
      for (let c = 0; c < 4; c++) d[o + c] += (d[o + 4 + c] - d[o + c]) * e      // freeze where it is now
      for (let c = 0; c < 4; c++) d[o + 4 + c] = shape[i * 4 + c]
      d[o + 9] = m.delay ? Math.min(1, Math.max(0, m.delay(shape[i * 4], shape[i * 4 + 1], shape[i * 4 + 2], i))) : this.rnd[i]
    }
    this.waveFrom += (this.waveTo - this.waveFrom) * Math.min(1, this.morph)
    this.waveTo = m.wave ?? 0
    this.dur = m.duration ?? 2.4; this.stagger = m.stagger ?? 1; this.turb = m.turbulence ?? 0.35
    this.morph = 0
    if (!this.gl.isContextLost()) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo)
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, d)
    }
  }
  get progress() { return this.morph }
  set(options: FieldOptions) { Object.assign(this.o, options) }

  destroy() {
    cancelAnimationFrame(this.raf); this.ro.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.onLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()   // free GPU memory now, not at GC
  }

  private onLost = (ev: Event) => { ev.preventDefault(); cancelAnimationFrame(this.raf); this.raf = 0 }
  private onRestored = () => { this.build(); this.start() }
  private onVisibility = () => { if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0 } else this.start() }
  private start() { if (!this.raf && !document.hidden && !this.gl.isContextLost()) { this.last = 0; this.raf = requestAnimationFrame(this.frame) } }

  private build() {                                          // everything GL lives here: called at start and after restore
    const gl = this.gl
    this.uni.clear()
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float')
    this.maxPoint = Math.min(64, (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1])
    this.prog = link(gl, VERT, FRAG); this.fadeProg = link(gl, QUAD, FADE); this.postProg = link(gl, QUAD, POST)
    this.vao = gl.createVertexArray()!; this.vbo = gl.createBuffer()!
    gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW)
    const stride = 44
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 16)
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 32)
    gl.bindVertexArray(null)
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND)
    this.w = this.h = 0; this.fbo = null; this.tex = null    // forces resize() on the next frame
  }

  private resize() {
    const gl = this.gl, w = this.wantW, h = this.wantH
    if (w === this.w && h === this.h) return
    this.w = this.canvas.width = w; this.h = this.canvas.height = h
    if (this.tex) gl.deleteTexture(this.tex)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    this.tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, this.hdr ? gl.RGBA16F : gl.RGBA8, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0)
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private u(p: WebGLProgram, name: string) {
    const key = (p === this.prog ? 'p.' : p === this.fadeProg ? 'f.' : 'o.') + name
    if (!this.uni.has(key)) this.uni.set(key, this.gl.getUniformLocation(p, name))
    return this.uni.get(key)!
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const gl = this.gl
    if (gl.isContextLost()) return
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0   // clamp: a stalled tab must not jump
    this.last = now
    const reduced = this.reduced.matches
    this.time += dt * (reduced ? 0.25 : 1)
    this.morph = Math.min(1, this.morph + dt / this.dur)
    this.camera.yaw += dt * this.camera.yawSpeed * (reduced ? 0 : 1)
    this.resize()
    if (!this.fbo) return
    const { w, h, o } = this, c = this.camera
    const f = 1 / Math.tan(c.fov / 2)
    const eye: [number, number, number] = [
      c.target[0] + c.distance * Math.cos(c.pitch) * Math.sin(c.yaw),
      c.target[1] + c.distance * Math.sin(c.pitch),
      c.target[2] + c.distance * Math.cos(c.pitch) * Math.cos(c.yaw)]
    const vp = mul(perspective(f, w / h, 0.1, 60), lookAt(eye, c.target))

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, w, h)
    if (this.hdr && o.trail > 0 && !reduced) {               // feedback trail: multiply last frame down
      gl.useProgram(this.fadeProg); gl.blendFunc(gl.ZERO, gl.SRC_ALPHA)
      gl.uniform1f(this.u(this.fadeProg, 'uDecay'), Math.exp(-dt / o.trail))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    } else { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT) }

    gl.useProgram(this.prog); gl.blendFunc(gl.ONE, gl.ONE)   // additive
    const p = this.prog
    gl.uniformMatrix4fv(this.u(p, 'uViewProj'), false, vp)
    gl.uniform1f(this.u(p, 'uTime'), this.time); gl.uniform1f(this.u(p, 'uMorph'), this.morph)
    gl.uniform1f(this.u(p, 'uStagger'), this.stagger); gl.uniform1f(this.u(p, 'uTurb'), this.turb)
    gl.uniform1f(this.u(p, 'uDrift'), reduced ? 0 : o.drift)
    gl.uniform1f(this.u(p, 'uWaveFrom'), this.waveFrom); gl.uniform1f(this.u(p, 'uWaveTo'), this.waveTo)
    gl.uniform1f(this.u(p, 'uPointScale'), o.pointSize * f * h * 0.5)
    gl.uniform1f(this.u(p, 'uMaxPoint'), this.maxPoint); gl.uniform1f(this.u(p, 'uFog'), o.fog)
    gl.uniform1f(this.u(p, 'uReduced'), reduced ? 1 : 0); gl.uniform3fv(this.u(p, 'uColor'), o.color)
    gl.bindVertexArray(this.vao); gl.drawArrays(gl.POINTS, 0, this.count); gl.bindVertexArray(null)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h)
    gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.generateMipmap(gl.TEXTURE_2D)   // the whole bloom blur
    gl.useProgram(this.postProg); gl.blendFunc(gl.ONE, gl.ZERO)
    const q = this.postProg
    gl.uniform1i(this.u(q, 'uScene'), 0); gl.uniform2f(this.u(q, 'uRes'), w, h)
    gl.uniform3fv(this.u(q, 'uBg'), o.background); gl.uniform1f(this.u(q, 'uBloom'), o.bloom)
    gl.uniform1f(this.u(q, 'uExposure'), o.exposure); gl.uniform1f(this.u(q, 'uTime'), this.time)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(prog, sh)
  }
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost())   // a lost context also reports failure
    throw new Error(gl.getProgramInfoLog(prog) || 'link failed')
  return prog
}

// Column-major 4x4 matrices.
export function perspective(f: number, aspect: number, near: number, far: number): Float32Array {
  const m = new Float32Array(16)
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far)
  return m
}
export function lookAt(eye: number[], at: number[]): Float32Array {
  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2]
  const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl
  let xx = zz, xz = -zx                                     // cross((0,1,0), z)
  const xl = Math.hypot(xx, xz); xx /= xl; xz /= xl
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx // cross(z, x)
  return new Float32Array([xx, yx, zx, 0, 0, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1])
}
export function mul(a: Float32Array, b: Float32Array): Float32Array {
  const m = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    m[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
  return m
}
```

#### 5.3 Target shapes

Every shape is `count * 4` floats. A shape with fewer natural positions than points either reuses positions with jitter (text, sigil) or parks the surplus at brightness 0 (lattice). `matchOrder` sorts both clouds along the same key so that neighbours stay neighbours; without it every point crosses the whole screen and the morph reads as an explosion. Use it for sigil-to-sigil and sheet-to-sigil; skip it when an explosion is wanted.

```ts
// shapes.ts -- target shapes for PointField. Every function returns count * 4 floats: x, y, z, brightness.
// World units: the wave sheet spans [-4, 4] in x and z; upright shapes sit in the xy plane around y = 0.4.

const gauss = () => { let u = 0; while (u === 0) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * Math.random()) }

/** Flat jittered grid in the xz plane. Use with Morph.wave = 1 for the travelling-wave sheet, 0 for a still plane. */
export function sheet(count: number, half = 4, jitter = 0.35): Float32Array {
  const out = new Float32Array(count * 4), n = Math.ceil(Math.sqrt(count)), cell = 2 * half / n
  for (let i = 0; i < count; i++) {
    out[i * 4] = -half + (i % n + 0.5 + (Math.random() * 2 - 1) * jitter) * cell
    out[i * 4 + 2] = -half + (Math.floor(i / n) + 0.5 + (Math.random() * 2 - 1) * jitter) * cell
    out[i * 4 + 3] = 0.8
  }
  return out
}

/** Cubic lattice n x n x n centred on the origin; surplus points are parked at the centre with brightness 0. */
export function lattice(count: number, size = 3.2): Float32Array {
  const out = new Float32Array(count * 4), n = Math.max(2, Math.floor(Math.cbrt(count))), s = size / (n - 1)
  for (let i = 0; i < count; i++) {
    if (i >= n * n * n) { out[i * 4 + 1] = 0.4; continue }
    out[i * 4] = (i % n) * s - size / 2
    out[i * 4 + 1] = (Math.floor(i / n) % n) * s - size / 2 + 0.4
    out[i * 4 + 2] = Math.floor(i / (n * n)) * s - size / 2
    out[i * 4 + 3] = 0.7
  }
  return out
}

/** Points for a line of text: draw it once on an offscreen canvas, keep the pixels that are lit. */
export function text(count: number, str: string, width = 6.4, font = '700 120px "JetBrains Mono", monospace'): Float32Array {
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true })!
  g.font = font
  const m = g.measureText(str)
  c.width = Math.ceil(m.width) + 8; c.height = 160
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(str, 4, 80)   // sizing a canvas resets its state
  const px = g.getImageData(0, 0, c.width, c.height).data, lit: number[] = []
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 96) lit.push(x, y)
  const out = new Float32Array(count * 4), k = width / c.width
  for (let i = 0; i < count && lit.length; i++) {
    const j = Math.floor(Math.random() * (lit.length / 2)) * 2
    out[i * 4] = (lit[j] + Math.random() - c.width / 2) * k
    out[i * 4 + 1] = -(lit[j + 1] + Math.random() - 80) * k + 0.4
    out[i * 4 + 2] = gauss() * 0.015
    out[i * 4 + 3] = 0.9
  }
  return out
}

/** A sigil from a 15 x 15 mask (rows of '#' and '.'): strokes join lit neighbours; points crowd the strokes. */
export function sigil(count: number, mask: string[], size = 4.2, sigma = 0.09, dust = 0.12): Float32Array {
  const N = mask.length, on = (x: number, y: number) => y >= 0 && y < N && x >= 0 && x < N && mask[y][x] === '#'
  const seg: number[] = []                                   // x0, y0, x1, y1 in cell units
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!on(x, y)) continue
    let joined = false
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      if (!on(x + dx, y + dy)) continue
      if (dx !== 0 && dy !== 0 && (on(x + dx, y) || on(x, y + dy))) continue   // no diagonal across a corner
      seg.push(x, y, x + dx, y + dy); joined = true
    }
    if (!joined && !on(x - 1, y) && !on(x, y - 1) && !on(x - 1, y - 1) && !on(x + 1, y - 1)) seg.push(x, y, x, y)
  }
  const out = new Float32Array(count * 4), cell = size / N, nSeg = seg.length / 4
  for (let i = 0; i < count; i++) {
    const o = i * 4
    if (Math.random() < dust || nSeg === 0) {                // faint dust across the whole square
      out[o] = (Math.random() - 0.5) * size * 1.25; out[o + 1] = (Math.random() - 0.5) * size * 1.25 + 0.4
      out[o + 2] = gauss() * 0.25; out[o + 3] = 0.06
      continue
    }
    const s = Math.floor(Math.random() * nSeg) * 4, u = Math.random()
    const jx = gauss() * sigma, jy = gauss() * sigma, d = Math.hypot(jx, jy) / sigma     // distance to stroke, in sigmas
    out[o] = (seg[s] + (seg[s + 2] - seg[s]) * u + jx - (N - 1) / 2) * cell
    out[o + 1] = -(seg[s + 1] + (seg[s + 3] - seg[s + 1]) * u + jy - (N - 1) / 2) * cell + 0.4
    out[o + 2] = gauss() * 0.03 * (1 + 2 * d)
    out[o + 3] = 0.25 + 0.75 * Math.exp(-0.5 * d * d)        // brightest on the stroke
  }
  return out
}

/** Reorder `to` so each point travels to a nearby target: sort both clouds along the same axis. Cheap, not optimal. */
export function matchOrder(from: Float32Array, to: Float32Array, key = (x: number, y: number, z: number) => Math.atan2(y - 0.4, x) + 0.15 * z): Float32Array {
  const n = to.length / 4, rank = (a: Float32Array) => Array.from({ length: n }, (_, i) => i)
    .sort((p, q) => key(a[p * 4], a[p * 4 + 1], a[p * 4 + 2]) - key(a[q * 4], a[q * 4 + 1], a[q * 4 + 2]))
  const rf = rank(from), rt = rank(to), out = new Float32Array(to.length)
  for (let r = 0; r < n; r++) out.set(to.subarray(rt[r] * 4, rt[r] * 4 + 4), rf[r] * 4)
  return out
}

/** Three sigils at 120 degrees around an empty centre: the campaign map as one cloud. Petal k owns points [k*n/3, (k+1)*n/3). */
export function petals(count: number, masks: [string[], string[], string[]], radius = 1.45, size = 2.1): Float32Array {
  const out = new Float32Array(count * 4), per = Math.floor(count / 3)
  for (let k = 0; k < 3; k++) {
    const part = sigil(per, masks[k], size, 0.09, 0.18), a = Math.PI / 2 + k * 2.0943951   // first petal at the top
    for (let i = 0; i < per; i++) {
      const o = (k * per + i) * 4
      out[o] = part[i * 4] + radius * Math.cos(a)
      out[o + 1] = part[i * 4 + 1] - 0.2 + radius * Math.sin(a)   // sigil() centres on y = 0.4; the camera looks at 0.2
      out[o + 2] = part[i * 4 + 2]; out[o + 3] = part[i * 4 + 3]
    }
  }
  return out
}

/** Screen position (CSS px) to the world plane z = 0, for a camera at yaw 0, pitch 0. Used to hand a 2D layout to the cloud. */
export function screenToWorld(px: number, py: number, width: number, height: number, distance = 8.2, fov = 0.7, targetY = 0.2): [number, number] {
  const k = 2 * distance * Math.tan(fov / 2) / height
  return [(px - width / 2) * k, targetY - (py - height / 2) * k]
}

/** Per-shape look. Dense shapes need less exposure, or they clip to a white slab. */
export const LOOK = {
  sheet:   { pointSize: 0.035, exposure: 1.4, bloom: 0.9, trail: 0.12 },
  lattice: { pointSize: 0.035, exposure: 1.4, bloom: 0.9, trail: 0.06 },
  sigil:   { pointSize: 0.028, exposure: 0.9, bloom: 0.8, trail: 0.08 },
  text:    { pointSize: 0.020, exposure: 0.5, bloom: 0.5, trail: 0 },
} as const
```

Staggered ignition is the `delay` function passed to `setTarget`. Useful orders:

| Order | `delay(x, y, z, i)` | Reads as |
| --- | --- | --- |
| Random (default) | per-point random | dissolve |
| Reading order | `column(i) / 345` | the sentence unravels left to right (T6) |
| Radial | `min(1, hypot(x, y - 0.4) / 3)` | ignition from the centre |
| Stroke order | `depth / maxDepth` from `prepareSigil` (section 7) | the sigil is written |
| Height | `(y + 2) / 4` | rising, or draining when reversed |

#### 5.4 Canvas 2D fallback

Same camera, same wave, same per-point clock, no turbulence, square points. Use when `getContext('webgl2')` returns null, or returns a software renderer (request the context with `failIfMajorPerformanceCaveat: true` on the first attempt to detect this; that attribute is standard but was not tested here). Bloom: reuse the quarter-resolution blurred copy from `attack-fx.ts`.

```ts
// points-2d.ts -- Canvas 2D fallback for PointField: same wave, same morph clock, same camera, fewer points.
import { lookAt, mul, perspective } from './point-field'

export function wave(x: number, z: number, t: number): number {
  const r1 = Math.hypot(x + 1.6, z + 0.8), r2 = Math.hypot(x - 2.1, z - 1.2)
  return 0.55 * Math.sin(2.4 * r1 - 1.7 * t) / (1 + 0.35 * r1)
       + 0.40 * Math.sin(3.1 * r2 - 1.7 * t) / (1 + 0.35 * r2)
       + 0.12 * Math.sin(0.8 * x + 1.9 * z + 1.1 * t)
}

export type Cloud2D = { from: Float32Array; to: Float32Array; delay: Float32Array; waveFrom: number; waveTo: number; stagger: number }

/** Draw one frame. `ctx` is cleared by the caller (or faded with a translucent fill for trails). */
export function drawPoints2D(ctx: CanvasRenderingContext2D, c: Cloud2D, t: number, morph: number, width: number, height: number,
  yaw = 0, pitch = 0.33, distance = 8.2, fov = 0.7, pointSize = 0.035, color = '255,255,255') {
  const f = 1 / Math.tan(fov / 2)
  const eye = [distance * Math.cos(pitch) * Math.sin(yaw), 0.2 + distance * Math.sin(pitch), distance * Math.cos(pitch) * Math.cos(yaw)]
  const m = mul(perspective(f, width / height, 0.1, 60), lookAt(eye, [0, 0.2, 0]))
  const n = c.delay.length
  ctx.globalCompositeOperation = 'lighter'                   // additive, like gl.blendFunc(ONE, ONE)
  for (let i = 0; i < n; i++) {
    const o = i * 4, k = Math.min(1, Math.max(0, morph * (1 + c.stagger) - c.delay[i] * c.stagger))
    const e = k * k * k * (k * (6 * k - 15) + 10)
    const x = c.from[o] + (c.to[o] - c.from[o]) * e, z = c.from[o + 2] + (c.to[o + 2] - c.from[o + 2]) * e
    const y = c.from[o + 1] + (c.to[o + 1] - c.from[o + 1]) * e + (c.waveFrom + (c.waveTo - c.waveFrom) * e) * wave(x, z, t)
    const w = m[3] * x + m[7] * y + m[11] * z + m[15]
    if (w < 0.1) continue
    const sx = (0.5 + 0.5 * (m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * width
    const sy = (0.5 - 0.5 * (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * height
    const s = pointSize * f * height * 0.5 / w, size = Math.max(1, Math.min(6, s))
    const a = (c.from[o + 3] + (c.to[o + 3] - c.from[o + 3]) * e) * Math.exp(-0.09 * w) * Math.min(1, s * s)
    if (a < 0.01) continue
    ctx.fillStyle = `rgba(${color},${a.toFixed(3)})`
    ctx.fillRect(sx - size / 2, sy - size / 2, size, size)
  }
  ctx.globalCompositeOperation = 'source-over'
}
```

#### 5.5 T6, the band becomes the cloud (70.0 to 75.0)

1. *Hand-over (70.0).* Create the field with `N` points (20,000 on phones, 40,000 on desktop). Camera: `yaw = 0, yawSpeed = 0, pitch = 0`. Build the start shape from the band: point `i` sits on band dot `i mod 2070`, at `screenToWorld(x, y, W, H)`, with brightness `v` for the first 2,070 points and 0 for the rest. Call `setTarget(band, { duration: 0.01 })`, wait one frame, then hide the 2D band. The WebGL dots now coincide with the 2D dots they replace. Use `LOOK.text` for this state.
2. *Dissolve (70.0 to 75.0).* `setTarget(sheet(N), { duration: 5.0, stagger: 1.5, turbulence: 0.45, wave: 1, delay: (_x, _y, _z, i) => Math.floor((i % 2070) / 6) / 345 })`. Each point flies for 2.0 s; the leftmost column leaves at 70.0 and the rightmost at 73.0. Because ten points share each band dot and each lands somewhere different on the sheet, every token visibly becomes many points: one token, many dimensions.
3. *Tilt (70.6 to 73.8).* `camera.pitch = 0.33 * easeInOutSine(k)`. The flat page becomes a floor. This is the only large camera move in the CG before [D11]'s final pull-back, and it is the Ikeda turn from 2D to 3D [1].
4. *Look.* Interpolate from `LOOK.text` to `LOOK.sheet` across the same 5 s (`exposure` 0.5 to 1.4, `pointSize` 0.020 to 0.035, `trail` 0 to 0.12).
5. *Settle (75.0 to 78.0).* `camera.yawSpeed` rises from 0 to 0.05 rad/s over 3 s. The wave is alone, as in [D11] 70 to 78 s.

Sound: the 40 Hz flutter of landing beads slows to nothing across 70 to 73 s while [D11]'s drone holds; no new sound until the mask.

#### 5.6 T7, mask and prediction (78.0 to 88.0)

Content and meaning are fixed by [D09] E.1 and [D11] shot 4. Implementation with this renderer:

- *Mask (78.0 to 79.2).* Build a copy of the sheet in which points inside the masked rectangle have brightness 0.03 and a height offset `y = err * n_i` (`n_i` random in -1..1, `err = 0.5`), and call `setTarget(copy, { duration: 1.2, stagger: 0.3, turbulence: 0, wave: 1 })`. Points outside the mask do not move; a region goes dark, and inside it the nearly invisible points drift off the surface. That offset is the prediction error to come. Use one large block for the first statement (about 30% of the sheet, per [D11]), four smaller blocks later ([D09] gives I-JEPA's four targets at 15 to 20% each). The mask must have straight edges: it is the only rectangle in the shot and should read as something imposed.
- *Prediction (80.0 to 86.0).* The masked points are re-lit as predictions: `setTarget(original, { duration: 6.0, stagger: 5.0, turbulence: 0.25, wave: 1, delay: distance from the nearest mask edge, normalised })`. Each point's flight is 1.0 s and the front crosses the block over 5 s, from the edges inward: context predicts inward, which is what the method does [14]. Each point starts off the surface by its error offset and lands on it; the turbulence term supplies the wandering on the way.
- *Blue.* Predicted points must be the player's blue. The class has one colour uniform; add a per-point tint as below (sketch, not run): store brightness above 1 for predicted points and split it in the shader.

```glsl
// vertex shader additions: brightness 2.0..3.0 in aTo.w means "predicted point with brightness 0..1"
out float vTint;
float bTo = aTo.w > 1.5 ? aTo.w - 2.0 : aTo.w;      // use bTo in place of aTo.w when computing vAlpha
vTint = step(1.5, aTo.w) * e;
// fragment shader additions
uniform vec3 uAccent; in float vTint;
outColor = vec4(mix(uColor, uAccent, vTint) * (vAlpha * a), 1.0);
```

- *Loss read-out.* One number, `L`, falling from 0.412 to 0.031 as `0.412 * exp(-t / 1.6)` plus the floor ([D11]). It is the only text on screen.

### 6. The three-petal map

[D11] section 2 fixes the image: three petals at 120 degrees around an empty centre, about 1,200 dots each, each petal also its god's sigil. Two renderings are needed.

**At rest (2D canvas, chrome).** Dots drawn by `fillRect`, 3,600 in all. Motion, complete list:

- Breathing per petal: every dot's radius is multiplied by `1 + 0.06 * sin(2 pi t / T_k + phase)` with periods `T = 7.3, 8.9, 11.1 s` for Dark Young, Queen, Hastur. The periods share no small common multiple, so the three never visibly synchronise: three things that breathe separately.
- `phase` is `0.9 * d`, where `d` is the dot's distance to the nearest stroke in sigil cells: the breath travels outward from the strokes.
- Battle nodes are joined by 1 px lines at 18% white: a constellation. A line draws itself over 0.6 s (easeOutCubic, dash reveal) when the battle at its far end is unlocked. The current node's ring pulses at 0.5 Hz between 60% and 100% alpha.
- Nothing else. No drift of the whole map, no parallax.

**Reveals (PointField).** For the first reveal and each petal completion in [D11], switch to the cloud: `petals(N, [maskYoung, maskQueen, maskHastur])` puts petal `k` in points `[k * N/3, (k + 1) * N/3)`.

- *First reveal (7 s).* Start from the cleared board as a cloud (`sigil()` of the board's mask, scaled to the board's on-screen size through `screenToWorld`), then `setTarget(matchOrder(board, petals), { duration: 5, stagger: 0.6, turbulence: 0.3, delay: point's petal index / 3 })`. The board's own points become the first petal in place, and the other two petals condense out of its dust at 12% brightness. This implements [D11]'s 40-times pull-back without moving a camera, which also makes it safe under reduced motion.
- *Petal completion (3 s).* Rewrite that petal's brightness to 0.3 of its value and send 60 of its points to the centre: `setTarget` with `delay` = distance from the petal's tip, `duration: 3, stagger: 1.2, turbulence: 0.15`.
- *Triptych variant.* On wide screens the three petals may sit side by side in three equal panels separated by 1 px rules, joining into the triangle only at reveals (the Kurokawa format [11]). Optional.

Per-god differences should be in motion, not ornament: the Dark Young petal uses `sigma = 0.12` and `dust = 0.25` (fecund, spilling); the Queen's petal has 3% of its points re-seeded to a mirrored position every 2 s (it will not hold still, and the errors are symmetrical, which is the joke); Hastur's petal uses `sigma = 0.05`, `dust = 0.04` and no breathing at all: the only still thing on the map.

### 7. Dot-matrix sigils

#### 7.1 On the 15 by 15 board (225 dots, 2D canvas)

The board is a halftone of the sigil: every cell carries one dot whose size says how close the cell is to a stroke. The 3Blue1Brown attention grid uses the same encoding [5], so a player who watched the opening has already learned to read it.

- **Dot size by distance.** `d` = steps to the nearest wall cell (4-neighbour flood). Radius in cells: `0.03 + 0.19 * exp(-0.5 * (d / 0.85)^2)`, which gives 0.22, 0.125, 0.042, 0.03 for `d` = 0, 1, 2, 3 or more. Strokes are heavy, their neighbours are a visible halo, the rest is a faint regular grid.
- **Slow breathing.** Radius times `1 + 0.08 * sin(2 pi t / 6 - 0.9 d)`. Period 6 s; the phase term makes the swell run outward from the strokes at about one cell per 0.86 s. At 8% the area changes by 17%, far below any flash threshold, and it is slow.
- **Staggered ignition.** At battle start the sigil is written, not shown: each wall cell lights `45 ms * depth` after the first, where `depth` is its distance along the strokes from the stroke's first cell (8-neighbour flood through wall cells only). A 40-cell sigil with depth up to 20 takes 0.9 s. Each cell overshoots to about 1.5 times its resting alpha at 80 ms and settles with a 350 ms time constant. Unlit wall cells look like empty cells, so the board appears blank and then is inscribed.
- **Constellation lines.** 1 px lines between 8-adjacent wall cells at 10% in the god's hue, appearing 120 ms after both ends are lit.
- **Alive, not animated.** Every 9 to 14 s (random), one stroke segment of three to five cells drops to 40% alpha over 0.4 s and recovers over 1.2 s, as if something passed in front of it. Never two at once. This is the only irregular event on the board and should not be explained.
- **Game state.** Flag cells keep their own marks; the sigil dot sits under them at half alpha. A wall cell hit by an attack re-runs its ignition overshoot once (gate it with `allowFlash`, section 8).

```ts
// board-sigil.ts -- the 15 x 15 battle board as a breathing dot matrix. `mask` rows use '#' for wall cells.
export type SigilBoard = { dist: Uint8Array; depth: Int16Array; n: number; maxDepth: number }

export function prepareSigil(mask: string[]): SigilBoard {
  const n = mask.length, dist = new Uint8Array(n * n).fill(255), depth = new Int16Array(n * n).fill(-1)
  const wall = (i: number) => mask[Math.floor(i / n)][i % n] === '#'
  const flood = (seeds: number[], out: Uint8Array | Int16Array, pass: (i: number) => boolean, diag: boolean) => {
    let frontier = seeds, d = 0
    for (const s of seeds) out[s] = 0
    while (frontier.length) {
      const next: number[] = []; d++
      for (const i of frontier) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diag && dx && dy)) continue
        const x = i % n + dx, y = Math.floor(i / n) + dy, j = y * n + x
        if (x < 0 || y < 0 || x >= n || y >= n || !pass(j)) continue
        if (out === dist ? out[j] !== 255 : out[j] !== -1) continue
        out[j] = d; next.push(j)
      }
      frontier = next
    }
    return d - 1
  }
  const walls = Array.from({ length: n * n }, (_, i) => i).filter(wall)
  flood(walls, dist, () => true, false)                              // distance to the nearest stroke, in cells
  let maxDepth = 0
  for (const s of walls) if (depth[s] === -1) maxDepth = Math.max(maxDepth, flood([s], depth, wall, true))   // stroke order
  return { dist, depth, n, maxDepth }
}

/** Radius (in cells) and alpha of the dot in cell i at time t; `lit` = seconds since the board was ignited. */
export function sigilDot(b: SigilBoard, i: number, t: number, lit: number): { r: number; a: number } {
  const d = b.dist[i]
  const base = 0.03 + 0.19 * Math.exp(-0.5 * (d / 0.85) ** 2)        // 0.22, 0.125, 0.042, 0.03 at d = 0, 1, 2, 3
  const breath = 1 + 0.08 * Math.sin(6.2831853 * t / 6 - 0.9 * d)    // 6 s period; the phase runs outward from the strokes
  let a = d === 0 ? 0.55 : 0.10 + 0.25 * Math.exp(-d)
  if (d === 0) {
    const since = lit - 0.045 * b.depth[i]                           // 45 ms per step along the stroke
    if (since < 0) return { r: 0.03, a: 0.10 }                       // not lit yet: looks like any other cell
    a *= 1 + 0.6 * Math.exp(-since / 0.35) * Math.min(1, since / 0.08)   // overshoot to 1.6x, settle in about 1 s
  }
  return { r: base * breath, a: Math.min(1, a) }
}
```

Draw loop: for each cell `i`, `const { r, a } = sigilDot(board, i, t, t - litAt)`, then `ctx.arc(cx, cy, r * cellPx, 0, 2 * Math.PI)` filled in the god's hue at alpha `a`. 225 arcs per frame is negligible.

#### 7.2 As thousands of points (PointField)

`sigil(count, mask)` in section 5.3 is the same sign at boss scale: strokes joined between lit neighbours, points scattered around each stroke with a Gaussian of `sigma = 0.09` cells, brightness `0.25 + 0.75 * exp(-d^2 / 2)` by distance to the stroke in sigmas, depth jitter that grows with distance, and 12% of the points as dust at brightness 0.06. With additive blending the stroke's core saturates to white while its edge stays granular: the accumulation look of A.8.

- 8,000 points is enough for a clean sign; 24,000 gives the granular edge. Use `LOOK.sigil`.
- Entrance: `setTarget(matchOrder(current, sigil), { duration: 2.4, stagger: 1.0, turbulence: 0.5, delay: stroke order })`. Each point flies 1.2 s; the sign completes along its strokes.
- At rest: `drift = 0.012` keeps every point moving by about a pixel; `camera.yawSpeed = 0`, and instead rock the yaw by `0.06 * sin(2 pi t / 17)` so the depth jitter gives a slow parallax. A sigil that rotates freely reads as a logo; one that barely turns reads as an object in the room.
- The board and the cloud should be the same sign in the same place: when a boss enters, morph the cloud to the sigil at the board's on-screen rectangle (`screenToWorld`), cross-fade to the 2D board over 0.3 s, and destroy the field.

### 8. Robustness

| Concern | Rule | Where |
| --- | --- | --- |
| Device pixel ratio | cap at 2; cap the buffer at 2.5 megapixels | `PointField` constructor options |
| Resize | observe `device-pixel-content-box`; apply in the frame, not the observer [16] | `PointField.resize` |
| Hidden tab | stop the loop on `visibilitychange`; also suspend the `AudioContext`, because audio keeps a tab unthrottled [26] | `onVisibility`; the caller suspends audio |
| Long frames | clamp `dt` to 50 ms so a stall cannot skip a transition | `frame` |
| Context loss | `preventDefault`, stop, rebuild from the CPU copy on restore [17] | `onLost`, `onRestored`, `build` |
| No WebGL2 | 2D fallback at 4,000 to 6,000 points | section 5.4 |
| Leaving the CG | `destroy()` loses the context at once [16] | `destroy` |
| Reduced motion | cross-fade in place of flight; no turbulence, drift, trails or yaw; wave at quarter speed; no camera tilt in T6 (start already at pitch 0.33 and fade) | shader `uReduced`; callers check the same media query |
| Flashing | no more than two large-area flashes in any second; continuous pulses limited to 0.6 luminance units per second | below |

**Flash rules as design constraints.** The legal line is three flashes per second for large areas [24]; design to two.

- Whole-screen brightness may change by more than 10% only as a single event (a cut, a hit) and every such event passes through `allowFlash`.
- Anything that pulses over more than a 341 by 256 px area [24] uses `slew`: at 0.6 per second, a 10% rise and fall takes at least a third of a second, so three per second cannot be exceeded.
- The Queen's red field is `#C4162E`, R/(R+G+B) = 0.74 ([D11]), under the 0.8 definition of saturated red [24]. Keep any pulsing red below that ratio.
- Per-token ticks, cursor blinks and single dots are far inside the small-area exemption [24]; they need no gate.
- Ikeda-style strobing [2] is out, including in the Nyarlathotep group where it would be thematically tempting. Use disorder of position and timing there, never of full-field luminance.

```ts
// flash.ts -- one gate for every large-area brightness jump (hit flashes, ignitions, cuts to white).
const stamps: number[] = []
/** Returns true if a new flash may start now: never more than `max` in any rolling second (WCAG 2.3.1 allows three). */
export function allowFlash(nowMs: number, max = 2): boolean {
  while (stamps.length && nowMs - stamps[0] >= 1000) stamps.shift()
  if (stamps.length >= max) return false
  stamps.push(nowMs)
  return true
}
/** For anything that pulses continuously over a large area: cap the rate of change so a 10% swing up and down takes at least 1/3 s. */
export function slew(current: number, goal: number, dt: number, maxPerSecond = 0.6): number {
  const step = maxPerSecond * dt
  return current + Math.max(-step, Math.min(step, goal - current))
}
```

### 9. Build order

1. `point-field.ts`, `shapes.ts`, `points-2d.ts` as given (half a day to integrate; they have no dependencies).
2. Shot 4 with T6 and T7 (one day). It is the largest effect and proves the renderer.
3. The token band and T2, T4, T5 on the existing 2D layer (one to two days).
4. `AttentionBreath` for the subtitle, then reuse it for every story line in battle ([D09] recommendation 2).
5. Board sigil dots (half a day), then the map reveals.

## Pitfalls

**Rendering.**

1. **Dense shapes clip to a white slab.** With additive blending, 20,000 points packed into a line of text saturate completely; the first test render of the title was an unreadable glow [L]. Exposure and point size must change with the shape (`LOOK` table). Interpolate them during a morph.
2. **8-bit feedback never reaches black.** Multiplying an 8-bit buffer by a decay factor leaves a grey residue because small values round back to themselves. Use a half-float target or no trails. The class does this automatically; the 2D fallback's translucent-fill trail has the same flaw, so clear fully there.
3. **Dither before blending is lost.** Noise added in the sprite shader is quantised away by an 8-bit blend [21]. Dither once, in the last pass.
4. **Point size is capped by the device.** Query `ALIASED_POINT_SIZE_RANGE` [16]; never rely on a large sprite for a glow. Glow comes from bloom.
5. **Points are clipped by their centre.** A large point whose centre leaves the screen vanishes whole. Keep sprites under about 16 device pixels near the edges, or accept the pop. (General WebGL behaviour; not from a source read here.)
6. **A regular grid under perspective makes moire bands.** Jitter the sheet (0.35 of a cell), as [D09] also found.
7. **Mip-chain bloom is boxy when pushed.** Above `bloom` of about 1.5, single points on black show square halos. Switch to the separable blur [20] before raising it.
8. **Resizing clears the canvas.** Resizing in the observer callback can blank a frame that was already drawn [16]. Apply sizes inside the frame.
9. **Device-scale emulation lies.** Playwright's `deviceScaleFactor` did not change `devicePixelContentBoxSize` [L]. Check high-density behaviour on a real screen.
10. **Two WebGL contexts are one too many.** Browsers limit live contexts and each has its own memory. One `PointField` at a time; call `destroy()` when leaving a scene [16]. (The existence of a per-page context limit is general knowledge, not from a source read here.)
11. **Restore is not automatic.** Without `preventDefault()` on the lost event the context stays dead [17]. After restore, every buffer, texture, program and extension must be made again [17].
12. **The 60 fps figures here are a ceiling test on one desktop GPU.** No phone was measured. Start phones at 20,000 points and lower the count if the median frame exceeds 20 ms for two seconds.

**Motion and typography.**

13. **Unmatched morphs read as explosions.** Random pairing sends every point across the screen. Use `matchOrder`, or keep the pairing meaningful (band dot to its ten sheet points).
14. **Linear or symmetric easing on attention looks like a meter.** The asymmetry (120 ms in, 420 ms out) and the travelling lag are what make it organic. Do not "simplify" them to one constant.
15. **Too many arcs become a diagram.** Three, faint, brief. The full matrix belongs to [D11]'s pull-back, once.
16. **Glyph sampling depends on the font being loaded.** Sampling before the web font arrives yields the fallback face's shapes. Wait for `document.fonts.ready`. Setting a canvas's width also resets its font, so set the font again after sizing (the `text()` function does).
17. **Text must stay text until it leaves.** Do not render the subtitle as particles while it is being read: 2 px dots at phone sizes are not legible, and screen readers see nothing. Keep real text in the DOM or drawn with `fillText`, with an `aria-live` transcript, and convert to points only in T2.
18. **Timings assume the audio clock.** Schedule sound from `AudioContext.currentTime` and drive the picture from the same clock; two clocks drift within a 100 s piece.

**Truthfulness.**

19. **The cloud is not a projection of anything.** It is a formula. Calling it a t-SNE or UMAP, or implying cluster meaning, repeats the misreadings distill.pub documents [10]. The fiction can call it "representation space"; the interface must not label it as data.
20. **Six dots are not an embedding.** If `v(c, j)` is a hash, it is decoration that stands for a vector. Only the attention weights are claimed to be real ([D09] F), so only they may be described as real.
21. **A patch is not its average colour, and a frame is not its loudness.** Both shortcuts are tempting in T4 and T5 and both misstate the mechanism.
22. **JEPA does not paint the missing pixels.** The masked region must never fill with picture content; predictions are points in the abstract space [14].

**Safety and taste.**

23. **Ikeda's strobe is not available.** See section 8. The ignition overshoot, hit flashes and any cut to white all count as flashes when they cover a large area [24].
24. **Reduced motion is not "off".** The cross-fade variants keep every beat and its sound; only flight, tilt, yaw and trails go [25].
25. **Background tabs keep playing audio.** The browser throttles frames, not the `AudioContext` [26]. Suspend it on `visibilitychange`, or the CG's sound runs on without its picture.
26. **Occult by restraint.** The sigils work because almost nothing moves. Adding rotation, colour cycling or a second glow turns an inscription into a screensaver.

## Sources

All read on 2026-11-14 unless noted. "Read" means the page was fetched and its text examined; exceptions are stated.

1. Ryoji Ikeda, "datamatics" (artist's project page). https://www.ryojiikeda.com/project/datamatics/
2. Ryoji Ikeda, "test pattern" (artist's project page). https://www.ryojiikeda.com/project/testpattern/
3. Refik Anadol Studio, "Unsupervised: Machine Hallucinations: MoMA". https://refikanadolstudio.com/projects/unsupervised-machine-hallucinations-moma/
4. Robert Henke, "Lumière" (artist's page). https://roberthenke.com/concerts/lumiere.html
5. Grant Sanderson (3Blue1Brown), "Attention in transformers, step-by-step" (lesson text). https://www.3blue1brown.com/lessons/attention
6. Brendan Bycroft, `llm-viz` repository README. https://github.com/bbycroft/llm-viz (the live page https://bbycroft.net/llm returned only its title to the fetch tool)
7. Hackaday, "An Animated Walkthrough Of How Large Language Models Work" (2024-11-20). https://hackaday.com/2024/11/20/an-animated-walkthrough-of-how-large-language-models-work (search-result summary only; not read in full)
8. Smilkov, Thorat, Nicholson, Reif, Viégas, Wattenberg, "Embedding Projector: Interactive Visualization and Interpretation of Embeddings" (2016), abstract. https://arxiv.org/abs/1611.05469
9. TensorFlow, "Visualizing Data using the Embedding Projector in TensorBoard". https://www.tensorflow.org/tensorboard/tensorboard_projector_plugin
10. Wattenberg, Viégas, Johnson, "How to Use t-SNE Effectively", Distill (2016). https://distill.pub/2016/misread-tsne/
11. Ryoichi Kurokawa, "unfold" (artist's page; format details only). https://www.ryoichikurokawa.com/project/unfold.html
12. Anders Hoff, `sand-spline` repository README. https://github.com/inconvergent/sand-spline (https://inconvergent.net/generative/ and https://inconvergent.net/2017/grains-of-sand/ returned HTTP 403; method description unverified)
13. Dosovitskiy et al., "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale" (2020), abstract. https://arxiv.org/abs/2010.11929
14. Assran et al., "Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture" (I-JEPA, 2023), abstract. https://arxiv.org/abs/2301.08243
15. Défossez et al., "Moshi: a speech-text foundation model for real-time dialogue" (2024), abstract. https://arxiv.org/abs/2410.00037
16. MDN, "WebGL best practices". https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
17. Khronos, "WebGL Specification" (editor's draft), sections on the context lost and context restored events. https://registry.khronos.org/webgl/specs/latest/1.0/
18. MDN, "HTMLCanvasElement: webglcontextlost event". https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
19. MDN, "CanvasRenderingContext2D: globalCompositeOperation". https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation
20. Joey de Vries, "Bloom", LearnOpenGL. https://learnopengl.com/Advanced-Lighting/Bloom
21. Mikkel Gjoel, "Removing banding in Linelight". https://pixelmager.github.io/linelight/banding
22. Bridson, Hourihan, Nordenstam, "Curl-Noise for Procedural Fluid Flow", ACM Transactions on Graphics 26(3), 2007. https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf (PDF fetched but not machine-readable; claims taken from the abstract as returned by search; record at https://history.siggraph.org/?p=115355)
23. Philip Rideout, "Noise-Based Particles" (The Little Grasshopper). https://prideout.net/blog/old/blog/index.html@p=63.html
24. W3C, "Understanding Success Criterion 2.3.1: Three Flashes or Below Threshold" (WCAG 2.2). https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html
25. MDN, "prefers-reduced-motion". https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
26. MDN, "Page Visibility API". https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

Local and internal:

- `[L]` Tests run for this dossier on 2026-11-14: TypeScript 5.9.3 `tsc` with `strict`, esbuild bundle, Chrome via Playwright (`channel: 'chrome'`), ANGLE Metal on Apple M4. Existing code inspected: `app/src/game/attack-fx.ts`.
- `[D09]` `research/story/09-attention-multimodal-jepa-visualisation.md`.
- `[D11]` `research/story/11-awe-and-the-sublime-in-minimal-games.md`.

Searched but not used as evidence: the Khronos wiki page "HandlingContextLost" (HTTP 403), the GDC 2016 talk "Low Complexity, High Fidelity: INSIDE Rendering" (slides not read).
