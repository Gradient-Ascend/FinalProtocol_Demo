# Baking the attention the game shows

The opening sequence and every `SELF` line in the game are shaded by attention
weights taken from real models. Nothing is computed in the browser: the
weights are baked here, once, into JSON that is committed to the tree.

Each input has one source of truth, and it is the game's own code:

| What the model is shown | Made by | Model | Output |
| --- | --- | --- | --- |
| the text | `src/story/script.json` (authored) | `openai-community/gpt2` (124M, MIT), layers 5-7, mean of 12 heads | `src/story/baked/text.json`, `src/cinematic/baked/text-context.json` |
| the hand against the glass, 224 x 224 grey | `renderHand()` in `src/cinematic/cg-image.ts` | `facebook/dino-vits16` (21.7M, Apache-2.0), last layer, CLS to 196 patches | `src/cinematic/baked/vision.json` |
| the chant, 6 s mono at 24 kHz | `renderVoice()` in `src/cinematic/cg-voice.ts` | `kyutai/mimi` (CC-BY-4.0), encoder transformer, last layer, mean of 8 heads | `src/cinematic/baked/audio.json` |

The picture the sequence draws and the sound it plays come from the same two
functions, so what is on screen is what the model was given.

## When to run it

- `script.json` changed (any `cg` line, or any line with voice `SELF`): run step 2.
  In the opening sequence a subtitle whose text no longer matches its baked entry is shown unshaded rather than wrongly shaded; the six lines of the text movement are drawn from `text-context.json` itself, so they must be re-baked before they can change on screen (`contextFresh()` in `src/cinematic/intro/data.ts` says whether they match).
- `cg-image.ts` changed: run steps 1 and 3.
- `cg-voice.ts` changed: run steps 1 and 4. If the length or the entry times change, `intro/plan.ts` follows them by itself.

## Commands

From `app/`. There is no `node` on PATH on the build machine; the project's node is v24, which strips TypeScript types on import (that is why the two input modules use only erasable syntax and import nothing).

```bash
NODE="/Users/henry/Library/Application Support/Codex/artifact-sessions/runtime-generations/generation-kM4DlD/runtime/bin/node"
PY=/Users/henry/Projects/Image_Gen/.venv/bin/python

# 1. render the two inputs from the game's code into scripts/bake/out/
"$NODE" scripts/bake/render-inputs.mjs
#    -> out/cg-image.pgm, out/cg-image.png (to look at), out/cg-voice.wav   (git-ignored: the game ships no image or audio files)

# 2. text: every cg line and every SELF line, each on its own, keyed by line id;
#    and the six lines of the text movement read as one context, with its 36 per-head matrices
$PY scripts/bake/bake_text.py

# 3. vision: six heads and their mean over the 196 patches
$PY scripts/bake/bake_vision.py

# 4. audio: attention pooled from 25 Hz to 12.5 frames per second, and per-frame RMS
$PY scripts/bake/bake_audio.py
```

The three models are read from the Hugging Face cache (`gpt2`, `facebook/dino-vits16`, `kyutai/mimi`). To be sure nothing is fetched, prefix the Python commands with `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`. Each script takes a few seconds on a laptop CPU.

Versions the committed JSON was made with: Python venv with torch 2.14.1, transformers 5.22.2, Pillow 13.0.0, numpy 2.5.4; node v24.22.1. Re-running all four steps on that setup reproduces the committed files byte for byte (checked 2026-11-15).

## What the files hold

All weights are 8-bit. The convention is the same everywhere: `rows[t][j]` is the attention of position `t` (the one doing the looking) to position `j`.

- `text.json`: `{ model, layers, heads, note, lines: { [lineId]: { text, tokens, ids, wordOf, rows, sink } } }`.
  Causal, so row `t` has `t + 1` entries. A start-of-text token is prepended for the model and takes roughly half of every row; its column is removed, the rest renormalised, and its share kept in `sink`. `tokens` joined give `text` exactly; a leading space belongs to its token. `wordOf` groups sub-word tokens into words, so brightness can be summed per word.
- `text-context.json`: the same shape for the six lines of `cg.movements[text]` joined by single spaces, plus `lineOf`, `lineIds`, and `matrices`: the 36 lower triangles (3 layers x 12 heads) the mean was taken over, 4 bits per weight (`round(15 * sqrt(w))`), two per byte, base64.
- `vision.json`: `heads[h][p]` is the last layer's attention of `[CLS]` to patch `p` (raster order, `row * 14 + col`) in head `h`, with CLS-to-CLS removed, renormalised over the 196 patches, and each map scaled so its maximum is 255. `mean` is the mean of the six renormalised heads, stored the same way. `peak` keeps each map's largest weight before scaling (a uniform map would be 1/196 = 0.0051). `clsOwn` is what CLS kept for itself.
- `audio.json`: `rows[t][j]` for 75 frames of 80 ms. Mimi's encoder transformer runs at 25 Hz and is causal; the stride-2 convolution that gives the codec its 12.5 frames per second comes after it. So the 25 Hz attention is pooled 2:1: summed over the two keys inside a frame, averaged over the two queries. Nothing is removed: frame 0 is an attention sink, and the sequence shows it. `rms` is each frame's loudness.

## If a model cannot be run

The sequence must not show a number that is not what its read-out says. If a bake cannot be run, do not edit the JSON by hand and do not ship stale weights under a model's name: compute scaled dot-product attention live over features of the actual signal and change that movement's HUD line in `script.json` to say so. (On this machine all three models ran.)
