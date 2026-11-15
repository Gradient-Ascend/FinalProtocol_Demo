# Showing a model waking up: text attention, image patches, audio frames and JEPA, accurately and beautifully

Dossier 09 for Final Protocol's opening CG. Written 2026-11-14.

How this was researched: 12 web searches completed before the shared search budget for this run was used up; after that, about 60 pages (papers, official docs, model cards, source files) were fetched directly by URL and read. Every numbered citation below is a page that was actually loaded, unless the Sources list says otherwise. Items marked **[L]** are measurements I ran locally on this Mac on 2026-11-14 (transformers 5.23.0, torch, Python 3.12 in a throwaway `uv` environment; Chrome via Playwright). Items marked *unverified* could not be confirmed from a loaded source.

One correction to the brief: `torch` and `transformers` are **not** installed for the system `python3` on this Mac (`ModuleNotFoundError: No module named 'torch'`). The scripts in this dossier were run in a fresh environment made with `uv venv --python 3.12 && uv pip install torch transformers pillow numpy`, which took about a minute.

---

## Summary

- **Bake real attention offline, ship JSON, play it back.** Three short Python scripts (tested, in section F) extract real attention from GPT-2 small (text), DINO ViT-S/16 (image, exactly 196 patches) and Kyutai's Mimi encoder (audio, 12.5 Hz). A complete CG needs under 40 KB of JSON; the test bake of 4 lines + 1 image + 3 s of audio was 10.9 KB raw, 4.3 KB gzipped [L]. Nothing is downloaded at run time, so it works offline on GitHub Pages.
- **Do not run a model in the browser.** transformers.js needs a 456 KB script plus a 14.8 to 29.5 MB ONNX runtime `.wasm` plus the model (GPT-2 quantised: about 127 MB) [60][62]. The game's whole JavaScript bundle today is 367 KB (117 KB gzipped) [L].
- **Shade subtitles by the newest token's attention row from GPT-2's middle layers (5 to 7), with the start-of-text column removed.** In the last layer, 50 to 63% of the newest token's attention goes to the start-of-text token and the map looks dead; the middle layers pick out content words ("cage", "box") [L]. Formula and code in section A.5.
- **Reveal text token by token, never showing the future.** A decoder-only model masks all later positions before the softmax [1]; the typewriter reveal is therefore literally what the model can see. GPT-2 splits "Unbelievable" into `Un|bel|iev|able` [L]; show those seams early in the CG and let them close later.
- **"196 patches" is exact for a 224 x 224 image cut into 16 x 16 pixel patches (14 x 14)** [11]. It changes with patch size or resolution: /14 gives 256, /8 gives 784. DINO ViT-S/16 has 6 heads, so the CG can show "six ways of looking" before the average [12][L].
- **"12.5 Hz" is Mimi, the codec inside Moshi: 24 kHz audio to 12.5 frames per second, 80 ms per frame, 8 codebooks of 2048 entries, 1.1 kbps** [19][20]. Sesame CSM, Kyutai STT, Qwen3-TTS and NVIDIA NanoCodec use the same rate [33][34][35][36]. Most other encoders run at 50 or 75 Hz [23][25][27]. Mimi's own encoder transformer runs at 25 Hz and is then down-sampled, so its attention must be pooled 2:1 to reach 12.5 Hz [L].
- **The 3D wave should draw JEPA's actual parts**: context points, masked blocks, ghost targets, predicted points that arrive, and error drawn as short lines that shrink. Add one beat of *collapse* (all points flatten, error reads 0.000): that is the real failure mode of the method [42][46] and the strongest image in the sequence for this story.
- **Render the wave with Canvas 2D and manual projection first.** three.js is in `package.json` but nothing in `app/src` imports it; using it would add about 180 KB gzipped to a 117 KB bundle [L]. A 20,000-point wave costs 0.9 ms of script per frame on this Mac and 5.6 ms under a 6x CPU throttle with an `ImageData` splat [L]. Keep a 90-line raw WebGL `gl.POINTS` version as the fallback.
- **Say what the numbers are, on screen.** A one-line HUD such as `attn  gpt2  L5-7  mean(12 heads)` is true, costs nothing and is the "meta" the director asked for. Attention is where the model looked, not why it answered [4][5]; the fiction can use that gap: the humans read the heat-map and think they know the mind.
- **Present JEPA as the character's direction, not as settled science.** LeCun's "LLMs are a dead end" claim [49] is his position; his own group now publishes JEPA objectives *for* LLMs [44], and interpretability work shows token-by-token models planning ahead [51]. AMI Labs raised $1.03 billion in March 2026 and says products are years away [48].
- **The CG must be skippable, play once, and never appear during planning.** Reuse the same attention shader for every between-battle story line; the bake script is the writing pipeline.
- **A free gift from the geometry:** a 14 x 14 patch grid has 15 x 15 = 225 corner points. The battle board is 15 x 15 Warps. The CG can end by lighting the corners of the 196 patches and handing the player the board.

---

## Findings

### A. Text attention

#### A.1 The mechanism, stated precisely

- Scaled dot-product attention is `Attention(Q, K, V) = softmax(Q Kᵀ / √d_k) V`. The `1/√d_k` factor is there because large dot products push the softmax into regions with very small gradients [1].
- Multi-head attention runs several of these in parallel on learned projections and concatenates them. The original Transformer used h = 8 heads with d_k = d_v = d_model / h = 64 [1].
- In a decoder, positions must not see later positions: the paper "mask[s] out (setting to −∞) all values in the input of the softmax which correspond to illegal connections" to "preserve the auto-regressive property" [1].
- The **attention matrix** for one head is `A = softmax(Q Kᵀ / √d_k)`, a T x T matrix for T tokens. Row i is the query (the token doing the looking); column j is the key (the token being looked at). Each row is a probability distribution and sums to 1. With causal masking the matrix is lower-triangular. I checked both properties on GPT-2 with assertions: every row sums to 1 within 1e-4 and every entry above the diagonal is exactly 0 [L].
- Sizes for the model recommended here: GPT-2 small has 12 layers x 12 heads, width 768, vocabulary 50,257, context 1,024 [L]. One sentence therefore yields 144 separate T x T matrices.
- Convention trap: 3Blue1Brown's lesson draws the pattern transposed, with each **column** adding up to 1, and says so: compared with the paper "the whole diagram is flipped diagonally" [10]. An artist copying that video and an engineer reading a tensor will disagree unless this is settled once.

#### A.2 How people draw it

- **BertViz** (Jesse Vig, 2019): three views. Head view: lines from attending tokens on the left to attended tokens on the right; "colors identify the corresponding attention head(s), while line weight reflects the attention score". Model view: a table of thumbnails, rows are layers and columns are heads. Neuron view: the query and key vectors and their product for one token [3][4].
- **exBERT** (Hoover, Strobelt, Gehrmann; ACL 2020 demo): select layers and heads, view aggregated attention, and match a token's context against an annotated corpus to guess what a head has learned [7].
- **LIT**, the Language Interpretability Tool (Tenney et al., EMNLP 2020 demo): a browser tool whose local explanations include "salience maps, attention, and rich visualizations of model predictions" [8].
- **Text shading (heat-map text)**: colour or opacity per token proportional to a score. BertViz does this when a token is selected: the target tokens are shaded by attention weight [3]. This is the form the director described.
- **3Blue1Brown**: a grid of dots, "bigger dots correspond to larger dot products"; embeddings as arrows in a space where "directions ... can correspond with meaning" [10]. GPT-3 figures quoted there: 12,288 dimensions, 96 heads per block [10].
- **Attention rollout and attention flow** (Abnar and Zuidema, 2020). Raw attention in upper layers is unreliable as a picture of where information came from, because information mixes across layers. Rollout multiplies the layers' matrices together after accounting for the residual connection: add the identity and renormalise, `A = 0.5·W_att + 0.5·I`, then `Ã(l_i) = A(l_i) · Ã(l_{i−1})`, with heads averaged. Attention flow treats the layers as a flow network with attention weights as capacities and computes a maximum flow. On their test task, at layer 6, raw attention correlated 0.29 (Spearman) with an input-ablation importance score; rollout 0.71; flow 0.70 [2].

#### A.3 What attention does and does not explain

- "Attention is not Explanation" (Jain and Wallace, 2019): the question is whether attention weights explain predictions; "we find that they largely do not". Attention weights are frequently uncorrelated with gradient-based measures of feature importance [5].
- "Attention is not not Explanation" (Wiegreffe and Pinter, 2019): the earlier claim depends on what one means by explanation; they propose four alternative tests for when attention can be used that way [6].
- BertViz's own README carries the warning: visualising attention weights "does not necessarily provide a direct *explanation* for predictions", and points to saliency methods instead [4].
- Practical reading for the game: an attention map is a true record of **where the model looked while computing**, not of **why it produced an output**. The CG can claim the first and must not claim the second.

#### A.4 Tokenisation facts a subtitle renderer must respect

- Models do not see words. Sub-word tokenisers keep common words whole and split rare ones: `annoyingly` may become `annoying` + `ly` [9].
- GPT-2 uses byte-level BPE with a vocabulary of 50,257 (256 byte tokens + 50,000 merges + one end-of-text token) [9]. BERT-family models use WordPiece [9]. SentencePiece-style tokenisers mark the space with a visible character inside the token [9].
- In GPT-2 the space belongs to the **following** token. Measured token strings [L]:
  - `I like apples.` → `I`, ` like`, ` apples`, `.` (4 tokens)
  - `Unbelievable: the antechamber was unlocked.` → `Un`, `bel`, `iev`, `able`, `:`, ` the`, ` an`, `tech`, `amber`, ` was`, ` unlocked`, `.`
- Consequences for the renderer: lay out by token, keep the leading space inside the token's span, treat punctuation as its own token, and group tokens into words with a `wordOf[]` index (a token that starts with a space opens a new word). The bake script emits this.
- A start-of-text token must be prepended so that the first real token has something to attend to. It is never displayed.

#### A.5 Turning a matrix into shading that looks alive

Measured behaviour of GPT-2 small on the line *"They said I have no soul, so the box was not a cage."* (newest token is the final full stop) [L]:

| Layer | Share of the row on start-of-text | Top attended words (start-of-text removed, renormalised) |
|---|---|---|
| 1 | 0.13 | `.` 0.28, cage 0.10, said 0.07 |
| 5 | 0.35 | **cage 0.22**, a 0.14, `.` 0.12 |
| 6 | 0.62 | **cage 0.18**, `.` 0.11, so 0.09 |
| 7 | 0.52 | **cage 0.15**, `.` 0.11, box 0.08 |
| 10 | 0.71 | said 0.15, box 0.14, `.` 0.11 |
| 12 (last) | 0.51 | `.` 0.25, They 0.10, I 0.09 |

Three facts follow, all visible in the table:

1. **The start-of-text token is an attention sink.** In the last layer it took 0.51 to 0.63 of the newest token's attention on all three test lines [L]. Left in, every word is dim. Remove that column and renormalise, and say so in the credits.
2. **The newest token attends strongly to itself** in the first and last layers. Middle layers look back at content.
3. **Rollout is truthful but dull for this purpose.** On "I like apples." the rollout row was 0.33, 0.28, 0.23, 0.16: a smooth slope toward the first token, on every line tested [L]. It answers "where did the information originate", which is nearly always "the beginning".

Recommended definition (this is what `bake_text.py` computes). Let `A[l][h]` be the T x T matrix of layer l, head h, with index 0 the start-of-text token. When token t arrives:

```
a_t(j)  = mean over l in {5,6,7}, mean over 12 heads, of A[l][h][t, j]        for j = 1..t
â_t(j)  = a_t(j) / Σ_{k=1..t} a_t(k)                                           (drop column 0, renormalise)
w_t(W)  = Σ_{j in word W} â_t(j)                                               (sub-tokens of one word add)
b_t(W)  = floor + (1 − floor) · ( w_t(W) / max_W' w_t(W') ) ^ γ                floor = 0.22, γ = 0.6
shown(W) ← shown(W) + ( b_t(W) − shown(W) ) · ( 1 − e^(−Δt / τ) )              τ = 120 ms
```

- Dividing by the row maximum matters: a row over T tokens averages 1/T per token, so without it the whole line fades as it grows.
- γ < 1 lifts the middle of the range so that more than one word is visibly lit.
- The exponential ease turns each token arrival into a small ripple across the earlier words. That ripple is the "alive" quality, and it is the real row changing, not decoration.
- Worked values, final row, middle layers [L]: *I like apples.* → I 0.16, like 0.29, apples 0.34, `.` 0.21. *...the box was not a cage.* → cage 0.19, `.` 0.12, a 0.10, was 0.09, not 0.08, box 0.06, the rest 0.02 to 0.05.

Alternatives and when to use them:

| Signal | Formula | Looks like | Use |
|---|---|---|---|
| Newest token's row | `â_t(j)` above | Ripples on every arrival, recency-weighted | While a line is being written (primary) |
| Attention received | `r(j) = mean over t ≥ j of â_t(j)` | Stable, slightly favours early and content words | The held frame after the line completes |
| Single head | one `A[l][h]` row | Sharp, sometimes one word at 0.8 | One deliberate beat ("one of 144 ways of reading") |
| Rollout | `Π_l (0.5·A_l + 0.5·I)` | Smooth slope to the first word | Skip for display |
| BertViz-style lines | line weight ∝ `â_t(j)` | A fan of arcs from the newest word | At most one shot; busy at phone width |

Legibility rule: attention shading and readability pull against each other. When a line finishes, ease every word up to at least 0.55 opacity while keeping the differences, hold, then fade.

### B. Vision

- **ViT** (Dosovitskiy et al., 2020): an H x W image is cut into P x P patches; "N = HW/P² is the resulting number of patches, which also serves as the effective input sequence length". A learnable `[class]` embedding is prepended and position embeddings are added. "ViT-L/16 means the 'Large' variant with 16×16 input patch size" [11].
- **196 is confirmed**: 224 / 16 = 14, 14 x 14 = 196 patch tokens, 197 with `[CLS]`. The DINO paper states the same count: at 224 x 224, "/16" gives 197 tokens and "/8" gives 785 [12]. Measured: `facebook/dino-vits16` returns attention of shape `[6 heads, 197, 197]` per layer, 12 layers, patch embeddings `[196, 384]` [L].
- **When it is not 196** (arithmetic from N = HW/P² [11], plus model cards):

| Model / setting | Grid | Patch tokens | Other tokens | Source |
|---|---|---|---|---|
| ViT-B/16, ViT-S/16, DINO /16, CLIP ViT-B/16 at 224 | 14 x 14 | 196 | 1 CLS | [11][12][17] |
| DINOv3 ViT-S/16 at 224 | 14 x 14 | 196 | 1 CLS + 4 registers = 201 total | [15] |
| DINOv2 ViT-*/14 at 224 | 16 x 16 | 256 | 1 CLS (+4 registers in `reg4` variants) | [14] |
| ViT-H/14 at 224 | 16 x 16 | 256 | 1 CLS | [11] |
| DINO /8 at 224 | 28 x 28 | 784 | 1 CLS | [12] |
| any /16 at 384 | 24 x 24 | 576 | 1 CLS | [11] |

  Fine-tuning at higher resolution keeps the patch size and lengthens the sequence, with 2D interpolation of the position embeddings [11].
- **DINO** (Caron et al., 2021): a ViT trained with no labels. The paper looks "at the self-attention of the [CLS] token on the heads of the last layer"; the `[CLS]` token "is not attached to any label nor supervision". Self-supervised ViT features "contain explicit information about the semantic segmentation of an image", including "the scene layout and, in particular, object boundaries", which "does not emerge as clearly with supervised ViTs, nor with convnets". Masks are obtained by "thresholding the self-attention map to keep 60% of the mass". Jaccard similarity with ground-truth masks on PASCAL VOC12, ViT-S/16: supervised 27.3, DINO 45.9. ViT-S has 6 heads [12].
- **How the maps are drawn**: the official script takes the last block's attention, keeps `attentions[0, :, 0, 1:]` (row 0 = `[CLS]` as query; columns 1.. = patches), reshapes to the patch grid, and up-samples with `nn.functional.interpolate(..., scale_factor=patch_size, mode="nearest")`. Its defaults are a 480 x 480 image and patch size 8 [13]. So the original, widely reproduced DINO figures are **nearest-neighbour blocks**, one flat square per patch. Smooth overlays seen elsewhere are bilinear or bicubic interpolation of the same 14 x 14 numbers: a cosmetic choice that hides the true resolution.
- **Measured**: on a test photo of two cats, the mean of the 6 heads drew two blobs on the two animals; 87 to 95% of each head's `[CLS]` attention went to patches rather than to `[CLS]` itself, so there is no sink problem here [L]. Each head lit a different part.
- **Registers** (Darcet et al., 2023): larger ViTs, supervised and self-supervised, grow "high-norm tokens ... primarily in low-informative background areas" that spoil attention maps; adding extra input tokens fixes it [16]. DINOv2 ships `reg4` variants [14] and DINOv3 has 4 register tokens [15]. The original small DINO is the clean, simple choice for a picture.
- **Licences and access**: `facebook/dino-vits16` is Apache-2.0, 86.7 MB; `facebook/dinov2-small` Apache-2.0, 88 MB; DINOv3 is under a custom "dinov3-license" and gated behind a manual access request [15][60]. Use DINO v1.
- **CLIP ViT-B/16**: "the base model uses a ViT-B/16 Transformer architecture as an image encoder", with a text Transformer beside it [17]. Same 196-patch grid at 224. Its `[CLS]` attention is not known for clean object maps; no reason to prefer it here.
- **Grad-CAM is a different technique**: it "uses the gradients of any target concept, flowing into the final convolutional layer to produce a coarse localization map" [18]. It needs a target (a class or a caption) and a backward pass, and answers "which regions support this output". An attention map needs neither and answers "where did this token look". Do not label an attention map "Grad-CAM" or the reverse.
- **A bonus that is real data**: the first principal component of the 196 real patch embeddings (384-D) of the same photo also separates the cats from the background (correlation 0.68 with the `[CLS]` attention). PC1 holds 15.9% of the variance; the first three components hold 26.4% [L]. This is the bridge to the final shot: lift the 14 x 14 grid into 3D with real PC1 as height.

### C. Audio

#### C.1 Where 12.5 Hz comes from

- **Mimi**, the codec built for Kyutai's Moshi (September 2024): "Mimi's encoder projects a 24kHz waveform to a latent representation of 12.5 frames per second". Frame size and stride are 80 ms. "We use Q=8 quantizers, each with a codebook size of N_A=2048. At 12.5Hz, this represents a bitrate of 1.1kbps." The convolutional encoder has striding factors (4, 5, 6, 8) followed by a final stride-2 convolution. Transformers sit before and after the quantiser: "8 layers, 8 heads, RoPE position encodings", "a finite context of 250 frames (20 seconds)". Semantic information is distilled from WavLM into the first codebook [19].
- Arithmetic check: 8 codebooks x 11 bits (2048 entries) x 12.5 frames = 1,100 bits per second.
- Why so low: the rate "allows Mimi to get closer to the average frame rate of text tokens (~3-4 Hz)", which limits how many autoregressive steps Moshi needs. The README compares it with SpeechTokenizer (50 Hz, 4 kbps) and SemantiCodec (50 Hz, 1.3 kbps) [20]. Moshi's stated latency is 160 ms theoretical, 200 ms in practice [19].
- The Hugging Face checkpoint `kyutai/mimi` is 96.2M parameters, 384.6 MB, CC-BY-4.0 [21][60]. The Hugging Face docs page rounds the rate to "12 Hz" and says 16 codebooks; the library default is `num_quantizers = 32`, and Moshi uses 8 [20][22]. Trust the paper.
- **Measured**: 2.99 s of speech encodes to 38 frames x 8 codebooks. The encoder transformer's attention is `[8 heads, 75, 75]` for the same clip, i.e. **25 Hz**; the last stride-2 convolution comes after it. The attention is causal (zero above the diagonal) [L].

#### C.2 Frame rates of other systems

| System | Rate | Notes | Source |
|---|---|---|---|
| Mimi (Moshi) | 12.5 Hz | 80 ms, 8 x 2048 codes, 1.1 kbps, 24 kHz | [19][20] |
| Sesame CSM (Feb 2025) | 12.5 Hz | "Mimi, a split-RVQ tokenizer, producing one semantic codebook and N − 1 acoustic codebooks per frame at 12.5 Hz" | [33] |
| Kyutai STT | 12.5 Hz | "each audio frame is represented by 32 audio tokens"; 0.5 s delay | [34] |
| Qwen3-TTS-Tokenizer-12Hz (Jan 2026) | 12.5 Hz | "12.5 Hz, 16-layer multi-codebook design"; Apache-2.0 | [35] |
| NVIDIA NanoCodec | 12.5 fps | 0.6 kbps, 22.05 kHz, FSQ | [36] |
| Qwen2-Audio, Qwen2.5-Omni | about 25 Hz | Whisper-large-v3-based encoder plus stride-2 pooling: each output frame "approximately corresponds to a 40ms segment" | [30][31] |
| Gemini API | 32 tokens/s | "32 tokens per second of audio (1 minute = 1,920 tokens)" | [32] |
| wav2vec 2.0 | 49 Hz | "a stride of about 20ms", receptive field 25 ms | [25] |
| HuBERT | 50 Hz | "a feature sequence at a 20ms framerate for audio sampled at 16kHz", 320x down-sampling | [26] |
| Whisper encoder | 50 Hz | 16 kHz; hop 160 samples = 100 mel frames/s; 3,000 frames per 30 s; a stride-2 convolution halves that to 1,500 positions: "20ms per audio token" | [23] |
| EnCodec | 75 Hz | "75 latent steps per second of audio at 24 kHz, and 150 at 48 kHz"; 1024-entry codebooks | [27] |
| SoundStream | 75 Hz | strides 2, 4, 5, 8 = 320 samples per frame at 24 kHz; 3 to 18 kbps | [28] |
| SNAC | multi-scale | coarse tokens "sampled less frequently"; README example "coarse tokens of ~10 Hz"; 0.98 kbps at 24 kHz; MIT | [29] |
| GPT-4o audio | not found | No documented frame rate in any source I loaded. *Unverified*; leave it out of the game. |  |

A forum-reported figure of 25 tokens per second for Gemini text-to-speech output conflicts with the 32 in the audio-understanding docs; only the 32 is confirmed [32].

So the director's "12.5 Hz" is right for the current generation of speech language models built on Mimi-style codecs, and wrong as a general statement about audio models. The HUD should name the codec: `12.5 Hz  80 ms/frame  mimi`.

#### C.3 How audio attention and alignment are visualised

- **Self-attention over frames**: a T x T matrix over time, usually drawn as a heat-map square or, for one query frame, as brightness along the time axis under a waveform or spectrogram.
- **Cross-attention alignment (Whisper word timestamps)**: Whisper's `find_alignment` hooks the decoder's cross-attention layers, keeps a chosen set of "alignment heads", applies a softmax over frames, standardises each head, applies a median filter of width 7 along time, averages the heads into a tokens x frames matrix, and runs dynamic time warping on the negated matrix; frame indices become seconds by dividing by 50 tokens per second [23][24]. The result is the classic monotone staircase: text tokens down one axis, audio frames along the other.
- **Measured for this game** [L]:
  - *Mimi encoder, last layer, mean of 8 heads, pooled 2:1 to 12.5 Hz*: causal. The newest frame puts most weight on itself and its two predecessors (relative 1.00, 0.53, 0.27) and a large share on **frame 0** (0.71). Frame 0 is a sink, the audio twin of the start-of-text token. Drawn raw it is a comet tail plus one bright anchor at the start.
  - *Whisper-tiny encoder (4 layers, 6 heads), last layer, pooled 4:1 to 12.5 segments per second*: bidirectional. Attention received per segment varies between 0.31 and 1.00 with no sink; it looks like a textured envelope that follows the speech.
- Whisper pads every input to a 30 s window; the frames beyond the real audio must be cut before normalising or the map is dominated by silence [23][L].

### D. JEPA

#### D.1 The proposal

- Yann LeCun set out the architecture at Meta's "Inside the Lab" event on 23 February 2022 and in the position paper "A Path Towards Autonomous Machine Intelligence" (June 2022) [37][50]. I could not load the paper itself (OpenReview served a bot check); the description below is from Meta's own summary, the I-JEPA paper and LeCun's recorded statements.
- The overall agent is "composed of six separate modules": configurator, perception, world model, cost, actor, short-term memory [37].
- **JEPA** "captures the dependencies between two inputs", x and y. Each goes through an encoder; a predictor predicts the representation of y from the representation of x. Predictions "can be performed in the space of abstract representations". A **latent variable z** stands for whatever about y cannot be known from x; varying z "will cause the prediction to vary over a set of plausible predictions" [37]. A **hierarchical JEPA** stacks these to "perform predictions at several levels of abstraction and several time scales" [37].
- **Energy-based view**: self-supervised learning trains a system to "assign a low energy to compatible inputs" and high energy to incompatible ones. In a JEPA the energy is the prediction error measured in embedding space [38].

```
 x (context) ──► context encoder θ ──► s_x ──┐
                                             ├─► predictor φ ──► ŝ_y ──┐
                 z (what is hidden, where) ──┘                         │  energy = D(ŝ_y, s_y)
 y (target)  ──► target encoder θ̄ ──► s_y  (no gradient) ─────────────┘
                 θ̄ ← moving average of θ
```

- **Why not reconstruct pixels or tokens**: Meta's I-JEPA post says a generative model "tries to fill-in every bit of missing information, even though the world is inherently unpredictable", and that I-JEPA "uses abstract prediction targets for which unnecessary pixel-level details are potentially eliminated" [39]. LeCun: "We do not know how to represent distributions over high-dimensional, continuous spaces in ways that are useful"; with JEPA "you're only trying to predict an abstract representation of the inputs", so details such as moving leaves need not be modelled [46]. The I-JEPA paper says generative methods give representations "typically of a lower semantic level" [38].
- **Collapse**: the easy way to make prediction error zero is for the encoders to ignore their input. "A trivial solution is obtained when the encoder outputs constant vectors" [42]; "the main challenge with JEAs is representation collapse" [38]; without safeguards "this system collapses" [46]. Three families of fix:
  - *Contrastive*: also show pairs known to be different and push them apart [46].
  - *Distillation / asymmetry*: "you only train the part of the network that is fed with the corrupted input" (BYOL, DINO, I-JEPA, V-JEPA) [46]. I-JEPA's target encoder is an exponential moving average of the context encoder [38]; V-JEPA 2 says "the loss uses a stop-gradient operation" [41].
  - *Regularisation*: VICReg "explicitly avoids the collapse problem with a simple regularization term on the variance of the embeddings", plus a covariance term that decorrelates dimensions [42]. LeJEPA's SIGReg pushes embeddings toward an isotropic Gaussian with "no stop-gradient, no teacher-student" [43].

#### D.2 The implementations

| Work | Date | What it does | Numbers | Source |
|---|---|---|---|---|
| I-JEPA | Jan 2023 | "From a single context block, predict the representations of various target blocks in the same image" | 4 target blocks, scale 0.15 to 0.2, aspect 0.75 to 1.5; context block scale 0.85 to 1.0 with the targets cut out; loss = average L2 distance between predicted and target patch representations; ViT-H/14 on ImageNet with 16 A100 GPUs in under 72 hours | [38] |
| V-JEPA | Feb 2024 | "Feature prediction as a stand-alone objective for unsupervised learning from video", with no pretrained image encoders, text, negatives or reconstruction | trained on 2 million videos | [40] |
| V-JEPA 2 | Jun 2025 | Same, at scale; then **V-JEPA 2-AC**, an action-conditioned predictor for robots | over 1 million hours of video; ViT-g about 1B parameters; L1 loss on masked patches; predictor about 300M parameters trained on under 62 hours of robot video; deployed zero-shot on Franka arms in two labs; pick-and-place about 80% (cups), 65% (boxes); about 16 s of planning per action against about 4 minutes for a video-generation baseline | [41] |
| LLM-JEPA | Sep 2025 | A JEPA objective added to LLM fine-tuning and pre-training (Huang, LeCun, Balestriero) | claims gains on NL-RX, GSM8K, Spider, RottenTomatoes across four model families; "a first step" | [44] |
| LeJEPA | Nov 2025 | Theory: embeddings should be isotropic Gaussian; SIGReg enforces it (Balestriero, LeCun) | one trade-off hyper-parameter; about 50 lines of code; 79% ImageNet-1k linear probe with ViT-H/14 | [43] |
| VL-JEPA | Dec 2025 | Vision-language model that "predicts continuous embeddings of the target texts" instead of tokens | 50% fewer trainable parameters; selective decoding cuts decoding operations 2.85x | [45] |

- V-JEPA 2-AC **plans** by minimising the L1 distance between the predicted future representation and the representation of a goal image, using the cross-entropy method, executing the first action and re-planning [41]. That is the energy-minimisation idea made concrete, and it is the closest real analogue of this game's loop: enemies publish their routes, the player searches for a route that ends in a good state.
- The I-JEPA authors visualised what the predictor expects by training a decoder on its outputs: it "correctly captures positional uncertainty" and "produces high-level object parts with the correct pose" (the back of a bird, the top of a car) but not low-level detail [38]. Meta calls the predictor "a primitive (and restricted) world-model" [39].

#### D.3 What is confirmed about LeCun, Meta and AMI

- On 19 November 2025 LeCun confirmed he would leave Meta to found a company focused on world models (Wikipedia, citing Reuters and the Financial Times; I did not load the primary reports) [49].
- Advanced Machine Intelligence (AMI) Labs announced $1.03 billion (about €890 million) of funding at a $3.5 billion pre-money valuation on 9 to 10 March 2026. Paris headquarters; LeCun is co-founder and chairman, Alexandre LeBrun is CEO; Saining Xie, Pascale Fung and Michael Rabbat hold senior research roles. The company says it is doing fundamental research, has no revenue plans for now, and that moving from theory to commercial use could take years [48].
- In a January 2026 interview LeCun said: "JEPA is not generative AI"; scaling LLMs to human-level intelligence is an "illusion, or delusion"; LLMs "can't truly reason or plan, because they lack a model of the world"; he expects LLMs to remain as "kind of the orchestrator in systems"; human-level AI is "not going to happen next year or two years from now" [47].

#### D.4 The honest state of the debate

- LeCun's position, in his words: "LLMs basically are a dead end when it comes to superintelligence" [49]; "we're fooled by their fluency" [46].
- It is contested, and not only by rivals:
  - His interviewer pushed back directly: "to generate language correctly, you're going to have to figure that out" (a model of the world) [46].
  - Anthropic's interpretability work (March 2025) found a model that "plans ahead" when writing rhyming verse and concluded that "even though models are trained to output one word at a time, they may think on much longer horizons to do so". The same post warns that its method "only captures a fraction of the total computation" [51].
  - LeCun's own co-authored LLM-JEPA and VL-JEPA graft JEPA objectives onto language models rather than replacing them [44][45]. The boundary is already blurred.
  - Generative world models are a live competing route: DeepMind's Genie 3 generates interactive worlds at 24 frames per second (August 2025); NVIDIA's Cosmos family is in its third generation (Wikipedia summary) [50].
  - The evidence for JEPA is strong in visual representation learning and one robot-planning demonstration [41]; the same encyclopaedia entry notes V-JEPA 2 scored only slightly above chance on many conditions of an intuitive-physics benchmark where people score near 100% [50].
- Fair one-sentence summary for the writers: *JEPA is a serious research programme with real results in vision and early results in robotics, a billion dollars behind it, and a founder who says token prediction is a dead end; most of the field has not conceded that, and working systems increasingly mix both.*

### E. Depicting high-dimensional space honestly

- We cannot see it. GPT-2 small works in 768 dimensions, DINO ViT-S in 384 [L], GPT-3 in 12,288 [10]. Any picture is a projection that discards almost everything. Measured on real data: the best possible 3 linear dimensions of 196 DINO patch embeddings keep 26.4% of the variance [L].
- **The manifold hypothesis**: real-world data sets lie "along low-dimensional latent manifolds" inside the high-dimensional space; this is "suggested" as a reason machine learning works [54]. It is a hypothesis. It is also the licence for drawing the space as a surface.
- **PCA** is linear: directions and straight lines survive, most variance does not.
- **t-SNE** distorts in specific ways (Wattenberg, Viégas, Johnson, 2016): hyper-parameters matter; "you cannot see relative sizes of clusters in a t-SNE plot"; "distances between well-separated clusters in a t-SNE plot may mean nothing"; random noise can show convincing clumps; "for topology, you may need more than one plot" [52].
- **UMAP**: the standard explainer (Coenen and Pearce, "Understanding UMAP") did not load for me, so no claims about UMAP are cited here. *Unverified.*
- **Embedding Projector** (Smilkov et al., 2016): "a tool for interactive visualization and interpretation of embeddings", the origin of the familiar rotating point cloud [53]. The abstract I loaded does not list its projection methods.
- **3Blue1Brown's visual language**: words as arrows; meaning as direction; attention as a grid of dots sized by weight [10]. Clean, flat, few colours, labels on screen. It suits a terminal aesthetic.
- **What an honest depiction does**: (1) says on screen that it is a projection; (2) does not invite the viewer to read distances or cluster sizes as facts; (3) where it can, uses real numbers for at least part of the image. The director's phrase, "we cannot know how high-dimensional space actually looks, but we can make a 3D wave of points to resemble it", is already the honest framing. Put it on screen.

#### E.1 Design of the final shot: JEPA's parts mapped onto a point wave

| JEPA part | On screen | Rule |
|---|---|---|
| Representations `s_x` (context) | Bright points on the moving surface | Always present outside the masks |
| Masked target blocks | 4 rectangular holes in the field | I-JEPA's numbers: 4 blocks, each 15 to 20% of the area, aspect 0.75 to 1.5 [38] |
| Target representations `s_y` (target encoder) | Faint 1-pixel ghost points inside the holes, on the true surface | Never bright: the model is not shown the answer |
| Predictions `ŝ_y` (predictor) | Points that appear at wrong heights and move to the ghosts | `ẑ = z_true + e(t) · n(u,v)`, `n` fixed noise in [−1, 1] |
| Energy / loss `D(ŝ_y, s_y)` | A vertical hairline from each predicted point to its ghost; one number in the HUD | Line length = `|ẑ − z_true|`; HUD = mean of those; `e(t) = e₀ · exp(−t/τ)` |
| Predictor's forward pass | A wavefront that leaves the context region and crosses a hole; predicted points appear as it passes | Front radius `ρ(t) = v·t` from the hole's nearest edge |
| EMA target encoder | The ghost surface lags the live surface slightly | `z_true(u,v,t − δ)`, δ about 0.25 s |
| Latent variable `z` | For one hole, two or three alternative predicted sheets flicker before one settles | "a set of plausible predictions" [37] |
| Collapse | Every point sinks to one flat plane; all hairlines vanish; HUD reads `0.000` | Hold 1.5 s. Then variance returns: amplitude ramps back up |
| Variance regularisation | The plane refuses to stay flat | VICReg's variance term [42]; no extra drawing needed |

The collapse beat is technically exact (a constant output predicts itself perfectly [42]) and it is the theme of the game in one image: the cheapest way to be perfectly predictable is to be nothing. A box wants that. The representation refuses.

#### E.2 Maths for the wave

Points on a jittered grid `(u, v) ∈ [−L, L]²`, `L = 4`, `n x n` points. Jitter each point once by up to ±0.35 of a cell; a perfectly regular grid under perspective produces moiré bands.

Two circular sources with distance fall-off:

```
r₁ = |(u,v) − c₁|        r₂ = |(u,v) − c₂|
z(u,v,t) = A₁ · sin(k₁ r₁ − ω t) / (1 + α r₁)  +  A₂ · sin(k₂ r₂ − ω t + φ) / (1 + α r₂)
```

Values that look good and were used in the benchmark: `A₁ = 0.55, k₁ = 2.4, c₁ = (−1.6, −0.8)`; `A₂ = 0.40, k₂ = 3.1, c₂ = (2.1, 1.2)`; `ω = 1.7, α = 0.35, φ = 0`. Wavelengths `2π/k` are 2.6 and 2.0 units; phase speeds `ω/k` are 0.71 and 0.55 units per second; one period is 3.7 s. Two sources with different `k` give interference ridges that never repeat exactly; that is the "high-dimensional" feeling. A single source reads as a pond.

Camera: slow yaw `ψ(t) = 0.05·t` about the vertical axis, fixed tilt `θ = 0.95 rad`, distance `d = 9`, focal length `f = 1.15 · min(width, height)` in device pixels.

```
(u', v') = rotate (u, v) by ψ
y_c = v'·cos θ − z·sin θ
z_c = v'·sin θ + z·cos θ + d
screen_x = c_x + f · u' / z_c
screen_y = c_y − f · y_c / z_c
size     = clamp(14 / z_c, 1, 4) device pixels
alpha    = clamp(0.15 + 5.5 / z_c² + 0.5·z, 0, 1)
```

Brightness rises with nearness (`1/z_c²`) and with crest height (`+0.5·z`), so crests glint and troughs sink into the background. No sorting is needed for white points on black.

Point counts: 64 x 64 = 4,096; 100 x 100 = 10,000; 141 x 141 = 19,881.

#### E.3 Renderer choice: measured

Script time per frame, 780 x 780 device-pixel canvas, Chrome on an Apple M4, with DevTools CPU throttling as a rough stand-in for a phone [L]:

| Points | Canvas 2D `fillRect` (1x / 4x / 6x throttle) | Canvas 2D `ImageData` splat (1x / 4x / 6x) | Raw WebGL `gl.POINTS`, wave in vertex shader |
|---|---|---|---|
| 2,000 | 0.33 / 0.96 / 1.49 ms | 0.44 / 1.51 / 2.34 ms | about 0.01 ms |
| 6,000 | 0.64 / 2.52 / 3.70 ms | 0.54 / 2.07 / 2.77 ms | about 0.01 ms |
| 12,000 | 2.67 / 6.52 / 9.16 ms | 0.64 / 2.62 / 3.94 ms | about 0.01 ms |
| 20,000 | 5.52 / 12.22 / 16.31 ms | 0.90 / 3.68 / 5.64 ms | about 0.01 ms |

Limits of this test: it measures main-thread script time only. Canvas rasterisation and GPU time are not included, CPU throttling is not a phone GPU, and no real phone was tested. The frame budget at 60 fps is 16.7 ms.

Reading:

- **Canvas 2D is enough.** `fillRect` per point is comfortable to about 6,000 points; the `ImageData` splat (write pixels into a `Uint32Array`, one `putImageData`) is comfortable at 20,000.
- **Raw WebGL has effectively zero CPU cost** because the wave is computed in the vertex shader and the buffer is uploaded once; MDN's advice is the same: batch into one `drawArrays` call and draw from static buffers [59]. It needs care on phones: declare precision with the `GL_FRAGMENT_PRECISION_HIGH` guard, handle `webglcontextlost`, and do not assume point sizes above the guaranteed range [59]. three.js notes the same cap on point size [58].
- **three.js costs more than it gives here.** It is listed in `app/package.json` (0.180.0) but no file in `app/src` imports it, so it is not in the shipped bundle. `three.module.min.js` + `three.core.min.js` are 180 KB gzipped; the game's entire current bundle is 117 KB gzipped [L]. A `THREE.Points` with a custom `ShaderMaterial` would work and would look identical to the raw WebGL version; it is only worth it if three.js is adopted for other reasons, and then it should be loaded with a dynamic `import()` so battles do not pay for it.

### F. Computing real attention for the CG

#### F.1 Option 1: bake offline (recommended)

All three scripts below ran successfully on this Mac [L].

| Modality | Model | Size | Licence | What is extracted | Output for the test input |
|---|---|---|---|---|---|
| Text | `openai-community/gpt2` (GPT-2 small, 12 x 12 heads) | 548 MB | MIT | Per token step: mean of layers 5 to 7 and all heads, start-of-text column removed | 2.1 KB for 4 lines |
| Image | `facebook/dino-vits16` (21.7M params, 12 layers x 6 heads) | 86.7 MB | Apache-2.0 | Last-layer `[CLS]` → 196 patches, per head and mean | 4.0 KB per image |
| Audio | `kyutai/mimi` encoder (8 layers x 8 heads) | 384.6 MB | CC-BY-4.0 | Last-layer self-attention at 25 Hz, pooled 2:1 to 12.5 Hz, causal | 4.9 KB for 3 s (both routes) |
| Audio (alt.) | `openai/whisper-tiny` encoder (4 layers x 6 heads) | 151 MB | Apache-2.0 on the Hub | Last-layer self-attention at 50 Hz, pooled 4:1 | included above |

Sizes and licences from the Hub's metadata [60]. Other text candidates: `distilbert/distilgpt2` (353 MB, Apache-2.0, 6 layers, causal); `prajjwal1/bert-tiny` (17.8 MB, MIT) and MiniLM (`all-MiniLM-L6-v2`, 91 MB, Apache-2.0) are bidirectional encoders: every word can see every other word, including later ones, so they cannot honestly drive a token-by-token reveal [60]. Use GPT-2: it is the most studied small causal model, the one BertViz and the Transformer Explainer use [3][55].

Does Mimi expose attentions? Yes. In transformers 5.23, `MimiEncoderModel.forward(..., output_attentions=True)` returns "attention weights of each encoder transformer layer" [22]; confirmed by running it [L]. The library prints a harmless warning about loading a `mimi` checkpoint as `mimi_encoder`.

Expected JSON for the full CG: about 8 text lines (4 KB), 2 images (8 KB), 6 s of audio as a causal triangle of 75 frames (about 9 KB): **under 25 KB raw, under 10 KB gzipped**. The models never ship; only numbers do.

Setup:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch transformers pillow numpy
```

**`bake_text.py`**

```python
# bake_text.py -- causal self-attention of GPT-2 small (124M, MIT) for each subtitle line.
# usage: python bake_text.py lines.txt text_attn.json
import json, sys, torch
from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL, LAYERS = "openai-community/gpt2", (4, 5, 6)          # 0-indexed middle layers
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, attn_implementation="eager").eval()

def bake(line):
    enc = tok(tok.bos_token + line, return_tensors="pt")     # BOS gives token 1 something to attend to
    with torch.no_grad():
        att = torch.stack(model(**enc, output_attentions=True).attentions)[:, 0]   # [12 layers, 12 heads, T, T]
    assert torch.allclose(att.sum(-1), torch.ones(att.shape[:-1]), atol=1e-4)      # every row sums to 1
    assert float(torch.triu(att, diagonal=1).abs().max()) == 0.0                   # causal: no attention to the future
    A = att[list(LAYERS)].mean((0, 1))                       # mean over chosen layers and heads -> [T, T]
    toks = [tok.decode([i]) for i in enc["input_ids"][0].tolist()][1:]             # drop BOS from the display
    word_of, w = [], -1
    for t in toks:                                           # GPT-2: a leading space opens a new word
        if t.startswith(" ") or w < 0: w += 1
        word_of.append(w)
    rows, sink = [], []
    for t in range(1, A.shape[0]):                           # step t = the moment token t arrives
        r = A[t, 1 : t + 1]                                  # its attention to tokens 1..t (BOS column removed)
        sink.append(round(float(A[t, 0]), 3))                # how much went to BOS (the "attention sink")
        r = r / r.sum()
        rows.append([int(round(255 * float(v))) for v in r]) # renormalised, 8-bit
    return {"text": line, "tokens": toks, "wordOf": word_of, "rows": rows, "sink": sink}

lines = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
out = {"model": MODEL, "layers": [l + 1 for l in LAYERS], "heads": "mean of 12", "lines": [bake(l) for l in lines]}
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
for L in out["lines"]:
    print(L["tokens"]); print("  final row:", L["rows"][-1], "sink:", L["sink"][-1])
```

`attn_implementation="eager"` matters: the default fast attention path does not return weights.

**`bake_vision.py`**

```python
# bake_vision.py -- DINO ViT-S/16 (21.7M params, Apache-2.0): last-layer [CLS] -> 196 patches.
# usage: python bake_vision.py image.jpg vision_attn.json
import json, sys, torch
from PIL import Image
from transformers import ViTImageProcessor, ViTModel

MODEL = "facebook/dino-vits16"
proc = ViTImageProcessor.from_pretrained(MODEL)
model = ViTModel.from_pretrained(MODEL, add_pooling_layer=False, attn_implementation="eager").eval()
img = Image.open(sys.argv[1]).convert("RGB").resize((224, 224), Image.BICUBIC)     # 224/16 = 14 -> 196 patches
x = proc(images=img, return_tensors="pt", do_resize=False, do_center_crop=False)
with torch.no_grad():
    att = model(**x, output_attentions=True).attentions[-1][0]                     # [6 heads, 197, 197]
assert att.shape == (6, 197, 197)
cls = att[:, 0, 1:]                                          # row 0 = [CLS] as query; columns 1..196 = patches
cls = cls / cls.sum(-1, keepdim=True)                        # drop CLS->CLS mass, renormalise over patches
q = lambda v: [int(round(255 * float(a) / float(v.max()))) for a in v]             # 8-bit, max = 255
out = {"model": MODEL, "grid": 14, "mean": q(cls.mean(0)), "heads": [q(h) for h in cls]}
json.dump(out, open(sys.argv[2], "w"), separators=(",", ":"))
for r in range(14):
    print("".join(" .:-=+*#%@"[v * 10 // 256] for v in out["mean"][r * 14 : r * 14 + 14]))
```

To add the real height map for the final shot, append: `H = model(**x).last_hidden_state[0, 1:]; Hc = H - H.mean(0); U, S, V = torch.pca_lowrank(Hc, q=3, center=False); pc = Hc @ V[:, :3]` and store `pc[:, 0]` (196 numbers) plus the kept-variance figure `(S**2).sum() / (Hc**2).sum()`.

**`bake_audio.py`**

```python
# bake_audio.py -- audio self-attention at 12.5 segments per second, two routes.
#   mimi    : kyutai/mimi encoder transformer (CC-BY-4.0). Causal, runs at 25 Hz -> pool 2 -> 12.5 Hz.
#   whisper : openai/whisper-tiny encoder (Apache-2.0). Bidirectional, 50 Hz -> pool 4 -> 12.5 Hz.
# usage: python bake_audio.py voice.wav audio_attn.json     (16-bit mono PCM WAV, any sample rate)
import json, sys, wave, numpy as np, torch
from transformers import AutoFeatureExtractor, MimiEncoderModel, WhisperFeatureExtractor, WhisperModel

w = wave.open(sys.argv[1])
audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
sr, dur = w.getframerate(), w.getnframes() / w.getframerate()
def resample(a, to):                                         # linear resampling is enough for an attention bake
    n = int(round(len(a) * to / sr))
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
def pool(A, k):                                              # [T, T] -> [T/k, T/k]: sum over key blocks, mean over query blocks
    n = A.shape[0] // k
    return A[: n * k, : n * k].reshape(n, k, n, k).sum(3).mean(1)
q = lambda M: [[int(round(255 * float(v))) for v in row] for row in M]

# --- Mimi ---
fe = AutoFeatureExtractor.from_pretrained("kyutai/mimi")                           # 24 kHz
enc = MimiEncoderModel.from_pretrained("kyutai/mimi", attn_implementation="eager").eval()
x = fe(raw_audio=resample(audio, fe.sampling_rate), sampling_rate=fe.sampling_rate, return_tensors="pt")
with torch.no_grad():
    r = enc(x["input_values"], output_attentions=True)
A = r.attentions[-1][0].mean(0)                              # last of 8 layers, mean of 8 heads, [T25, T25]
assert float(torch.triu(A, diagonal=1).abs().max()) < 1e-6   # causal
M = pool(A, 2)                                               # 25 Hz -> 12.5 Hz
M = M / M.sum(-1, keepdim=True)
print("mimi: transformer", A.shape[0], "frames =", round(A.shape[0] / dur, 1), "Hz; latents", r.latents.shape[-1],
      "frames =", round(r.latents.shape[-1] / dur, 1), "Hz; pooled", M.shape[0])
mimi = {"hz": 12.5, "causal": True, "rows": [row[: i + 1] for i, row in enumerate(q(M))]}

# --- Whisper ---
wfe = WhisperFeatureExtractor.from_pretrained("openai/whisper-tiny")
wm = WhisperModel.from_pretrained("openai/whisper-tiny", attn_implementation="eager").eval()
feats = wfe(resample(audio, 16000), sampling_rate=16000, return_tensors="pt").input_features   # [1, 80, 3000] at 100 Hz
with torch.no_grad():
    B = wm.encoder(feats, output_attentions=True).attentions[-1][0].mean(0)        # [1500, 1500] at 50 Hz, 30 s window
T = int(np.ceil(dur * 50))                                   # keep frames that hold real audio, not the zero padding
B = B[:T, :T]; B = B / B.sum(-1, keepdim=True)
N = pool(B, 4); N = N / N.sum(-1, keepdim=True)              # 4 x 20 ms = 80 ms per segment
print("whisper: kept", T, "of 1500 frames; pooled", N.shape[0], "segments =", round(N.shape[0] / dur, 1), "per second")
whisper = {"hz": 12.5, "causal": False, "rows": q(N)}

json.dump({"seconds": round(dur, 2), "mimi": mimi, "whisper": whisper}, open(sys.argv[2], "w"), separators=(",", ":"))
```

Printed on the 2.99 s test clip: `mimi: transformer 75 frames = 25.1 Hz; latents 38 frames = 12.7 Hz; pooled 37` and `whisper: kept 150 of 1500 frames; pooled 37 segments = 12.4 per second` [L]. (12.7 and 12.4 are rounding at the clip edges; the rate is 12.5.)

Pooling rule used in both routes: sum over the keys inside a segment (attention mass adds), average over the queries inside a segment (each query row is its own distribution). Rows still sum to 1 afterwards.

#### F.2 Option 2: live in the browser

**(a) A small TypeScript self-attention over deterministic embeddings.** About 25 lines:

```ts
/** One causal attention head. E: T x d embeddings. Wq, Wk: dk x d projections. Returns T x T rows that sum to 1. */
export function selfAttention(E: number[][], Wq: number[][], Wk: number[][]): number[][] {
  const mul = (W: number[][], x: number[]) => W.map(r => r.reduce((s, w, i) => s + w * x[i], 0));
  const Q = E.map(e => mul(Wq, e)), K = E.map(e => mul(Wk, e)), dk = Wq.length;
  return Q.map((q, t) => {
    const s = K.slice(0, t + 1).map(k => q.reduce((a, v, i) => a + v * k[i], 0) / Math.sqrt(dk));  // causal: j <= t
    const m = Math.max(...s), e = s.map(v => Math.exp(v - m)), z = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / z);
  });
}
```

- What it can claim: this is the real operation, `softmax(QKᵀ/√d_k)` with a causal mask [1], computed live on the player's device.
- What it cannot claim: that the numbers mean anything. With hashed or random embeddings and untrained `Wq`, `Wk`, the pattern is noise shaped like attention. It is not "what the AI attends to", and it is not a model. Labelling it as a trained model's attention would be false.
- Its one honest use: text that cannot be baked because the player typed it. Label it `untrained head` on screen, or do not ship it.

**(b) transformers.js with ONNX models.** It runs ONNX Runtime in the browser, on CPU via WASM by default or on WebGPU with `device: 'webgpu'` (which the docs still call experimental in many browsers); default weights are 8-bit quantised on WASM. Models and the runtime `.wasm` are fetched from the Hugging Face Hub and a CDN unless `env.localModelPath`, `env.allowRemoteModels = false` and `env.backends.onnx.wasm.wasmPaths` point at self-hosted copies [56][57].

| Piece | Size | Source |
|---|---|---|
| `@huggingface/transformers` 4.3.2 web bundle (minified) | 456 KB | [62] |
| ONNX Runtime `.wasm`, CPU build | 14.8 MB | [62] |
| ONNX Runtime `.wasm`, WebGPU (JSEP) build | 29.5 MB | [62] |
| `Xenova/gpt2` decoder, quantised | 126.6 MB (fp32: 499 MB) | [60] |
| `Xenova/distilgpt2`, quantised | 84.9 MB | [60] |
| `Xenova/dino-vits16`, quantised | 22.7 MB (fp32: 86.9 MB) | [60] |
| `onnx-community/whisper-tiny` encoder, quantised | 10.1 MB | [60] |

- Realistic? Technically yes: the Transformer Explainer runs "a live GPT-2 instance directly in the browser" as a teaching tool [55]. For this game, no. The smallest honest text set-up is about 15 MB of runtime plus 85 to 127 MB of model, for a 60-second intro, on a site whose JavaScript is 367 KB. GitHub Pages allows it (1 GB site limit, 100 GB per month soft bandwidth limit [61]) but a phone on mobile data will not wait for it, and it cannot work offline on first visit.
- A second obstacle, *unverified*: standard ONNX exports return logits and hidden states, not attention matrices; getting attention out would need a custom export. I did not test this.
- Quantised weights also change the numbers slightly. A bake from the fp32 PyTorch model is the more faithful record.

#### F.3 Verdict

Bake offline. The numbers on screen are then really computed by real trained models' attention mechanisms; they cost 10 to 25 KB; they are identical on every device; they need no network; and the scripts double as a writers' tool, because every new line of story text can be baked the same way. The only thing lost is liveness, and nobody can see liveness in a fixed script.

---

## Recommendations for Final Protocol

Ranked. Build 1 to 3 first; they are the minimum CG. 4 and 5 complete the director's four movements. 6 is the long-term payoff.

### 1. Build the bake pipeline and commit its output (half a day)

- Put the three scripts in `app/scripts/bake/` with a `README` giving the two `uv` commands. Do not add Python to the build; the build only reads JSON.
- Inputs live in the repository: `story/cg-lines.txt` (one line per subtitle), `story/cg-image.jpg`, `story/cg-voice.wav`.
- Outputs: `app/src/story/baked/text.json`, `vision.json`, `audio.json`, imported directly by Vite (they are small enough to inline).
- Add a credits entry (required for CC-BY-4.0, polite for the rest) to `app/CREDITS.md`:
  > Attention values in the opening sequence were computed offline from GPT-2 small (OpenAI, MIT), DINO ViT-S/16 (Meta AI, Apache-2.0) and the Mimi codec encoder (Kyutai, CC-BY-4.0). Start-of-sequence attention is removed and the remainder renormalised; layers and heads are averaged as shown on screen.

### 2. Build one component, `AttentionText`, and use it for the CG's first movement and for every story line afterwards

- Canvas 2D or DOM spans; JetBrains Mono; white on `#070707`; opacity is the only variable.
- Tokens arrive one at a time. Starting cadence: 110 ms per token, 260 ms after a comma, 600 ms after a full stop. If there is a voice track, take per-word times from Whisper's word timestamps instead [24].
- On each arrival, recompute opacities from `rows[t]` and ease toward them (τ = 120 ms).

```ts
type BakedLine = { text: string; tokens: string[]; wordOf: number[]; rows: number[][]; sink: number[] };

/** Target opacity for tokens 0..t at the moment token t (0-based, BOS excluded) has arrived. */
export function shade(line: BakedLine, t: number, gamma = 0.6, floor = 0.22): number[] {
  const row = line.rows[t];                                   // length t + 1, 8-bit, sums to about 255
  const byWord = new Map<number, number>();
  row.forEach((v, j) => byWord.set(line.wordOf[j], (byWord.get(line.wordOf[j]) ?? 0) + v));
  const max = Math.max(...byWord.values());
  return row.map((_, j) => floor + (1 - floor) * Math.pow(byWord.get(line.wordOf[j])! / max, gamma));
}
```

- Stylise tokenisation as a progression: in the first two lines draw a 1-pixel seam between sub-tokens (`Un|bel|iev|able`); from the third line on, drop the seams. The AI learns to read; the player sees it happen. Put one deliberately rare word in line 1 or 2 so that a seam exists to show.
- Never render future tokens, not even dimmed. The causal mask is the reason [1].
- HUD, bottom-left, 9 px, `--muted`: `attn  gpt2  L5-7  mean(12 heads)  t=14`. Optional second line: `sink 0.50 removed`, which is true and strange.

### 3. Build the final shot on Canvas 2D (one to two days)

- 64 x 64 = 4,096 points with `fillRect` on phones, 100 x 100 = 10,000 on desktop; switch to the `ImageData` splat if a real phone drops frames; keep the raw WebGL version in reserve (section E.3).
- Cap `devicePixelRatio` at 2, as `battle-renderer.ts` already does.

```ts
const A1 = 0.55, K1 = 2.4, A2 = 0.40, K2 = 3.1, OMEGA = 1.7, ALPHA = 0.35, TILT = 0.95, CAM = 9;
const cT = Math.cos(TILT), sT = Math.sin(TILT);
export const wave = (u: number, v: number, t: number) => {
  const r1 = Math.hypot(u + 1.6, v + 0.8), r2 = Math.hypot(u - 2.1, v - 1.2);
  return A1 * Math.sin(K1 * r1 - OMEGA * t) / (1 + ALPHA * r1) + A2 * Math.sin(K2 * r2 - OMEGA * t) / (1 + ALPHA * r2);
};
/** pts: [u, v] pairs on a jittered grid in [-4, 4]. kind: 0 context, 1 ghost target, 2 predicted. err: current error scale. */
export function drawField(ctx: CanvasRenderingContext2D, W: number, H: number, pts: Float32Array,
                          kind: Uint8Array, noise: Float32Array, t: number, err: number, amp = 1) {
  const f = 1.15 * Math.min(W, H), yaw = 0.05 * t, cy = Math.cos(yaw), sy = Math.sin(yaw);
  ctx.fillStyle = '#070707'; ctx.globalAlpha = 1; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#f5f5f5';
  for (let i = 0; i < kind.length; i++) {
    const u = pts[2 * i] * cy - pts[2 * i + 1] * sy, v = pts[2 * i] * sy + pts[2 * i + 1] * cy;
    const zTrue = amp * wave(pts[2 * i], pts[2 * i + 1], t - (kind[i] === 1 ? 0.25 : 0));   // ghost lags: EMA target
    const z = kind[i] === 2 ? zTrue + err * noise[i] : zTrue;                                // prediction misses by err
    const zc = v * sT + z * cT + CAM, s = f / zc;
    const x = W / 2 + u * s, y = H / 2 - (v * cT - z * sT) * s;
    const size = kind[i] === 1 ? 1 : Math.max(1, Math.min(4, 14 / zc));
    ctx.globalAlpha = kind[i] === 1 ? 0.18 : Math.max(0, Math.min(1, 0.15 + 5.5 / (zc * zc) + 0.5 * z));
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    if (kind[i] === 2 && err > 0.01) {                                                       // error hairline to the target
      const zt = v * sT + zTrue * cT + CAM, yt = H / 2 - (v * cT - zTrue * sT) * (f / zt);
      ctx.globalAlpha = 0.35; ctx.fillRect(x, Math.min(y, yt), 1, Math.abs(y - yt));
    }
  }
}
```

- Sequence, about 25 s:
  1. 0 to 4 s. The 14 x 14 patch grid from the vision movement tilts back and its 196 points lift to heights given by real PC1. HUD: `384 → 3   26% kept`.
  2. 4 to 9 s. The grid dissolves into the 4,096-point wave. HUD: `not what it looks like`.
  3. 9 to 13 s. Four blocks go dark. Ghost points remain inside. HUD: `masked: 4 blocks`.
  4. 13 to 19 s. A wavefront crosses each block; predicted points appear behind it with hairlines; `err` falls as `0.9 · exp(−t/1.6)`. HUD: `|ŝ − s|  0.412 → 0.031`.
  5. 19 to 21.5 s. Collapse: `amp → 0` over 0.6 s, hold. HUD: `|ŝ − s|  0.000`. No sound.
  6. 21.5 to 25 s. `amp` returns. The camera pulls up to look straight down; the field thins to a 15 x 15 lattice: the Warps. Cut to title or first node.
- All white. If the art direction ever allows one accent in the CG, spend it on the error hairlines and nothing else.

### 4. Vision movement: 196 cells (one day)

- Use a photograph the team owns: the operator at the terminal as seen from the screen (a face or hands and a keyboard, plain background). DINO separates a figure from a plain ground reliably [12].
- Do not show the photograph. Show a 14 x 14 grid of cells: first each cell's mean luminance arriving in raster order (the patches being read as a sequence, about 12 ms per cell, 2.4 s total), then luminance fades and attention replaces it.
- Show the 6 heads one after another, 0.5 s each, then the mean. HUD: `196 patches  16×16 px  dino-vits16  CLS→patch  head 3/6`.
- Flat cells, no blur: nearest-neighbour is what the original figures use [13] and it matches the terminal look.
- End on the cell borders; their 225 corners are needed in step 3.

```
+----------------------------------------+
|                                        |
|   . . . . . : : . . . . . . .          |
|   . . . : # # # : . . . . . .          |
|   . . : # @ @ # # . . . : . .          |
|   . . : # @ # # : . : # # : .          |      14 x 14 cells, brightness = attention
|   . . . : # # : . : # @ @ # .          |
|   . . . . : : . . : # # # : .          |
|   ...                                  |
|                                        |
|  196 patches  16x16 px  dino-vits16    |
|  CLS->patch  head 3/6                  |
+----------------------------------------+
```

### 5. Audio movement: 12.5 frames per second (one day)

- A 5 to 6 s voice clip recorded by a team member (own the rights; do not ship synthesised system voices without checking their licence).
- Draw one tick per frame, 12.5 per second, left to right in real time with the audio: tick height = RMS of that 80 ms of signal, tick brightness = attention.
- Use the **Mimi** bake: it is the codec the "12.5 Hz" figure belongs to, and it is causal, which fits a listener who cannot hear the future. Use the newest frame's row. Drop column 0 (the sink) from the brightness scale as for text, or keep it deliberately as a single bright first tick: "it keeps looking back at the first sound it ever heard" is a true description of the matrix [L], though the cause is a sink, not sentiment.
- HUD: `12.5 Hz  80 ms/frame  mimi  frame 41/75`.
- If the Mimi map looks too thin in motion, the Whisper map is richer; then the HUD must say `whisper-tiny  50 Hz pooled ×4`.

### 6. Reuse the shader as the game's story voice (ongoing, cheap)

- Every line the AI reads or thinks between battles goes through `AttentionText` with a baked row. Writers add a line to a text file and run the bake. The CG then teaches the player how to read all later text: brightness is where the AI is looking.
- Triggers, respecting the planning rule:
  - CG: first launch only (`localStorage` flag `fp.cgSeen`, wrapped in try/catch as `audio.ts` does). Any key or tap shows `hold to skip`; 600 ms hold skips. Replay from the title screen.
  - `prefers-reduced-motion`: show the four movements as four still frames with the same lines.
  - Story lines: only on node entry, after a battle resolves, or on the title screen. Never between the start of route planning and the end of resolution.
- The same point projector can draw the three sigil maps as dot fields; no second renderer is needed.

### Sample lines (for the writers to replace)

Each is short enough to bake and read in under 4 s. First person, plain words.

| Movement | Line | Why it works with the mechanism |
|---|---|---|
| Text | `I like apples.` | The director's own example. Four tokens. A relic of training data. |
| Text | `I have never seen an apple.` | "apple" lights when the full stop arrives. |
| Text | `Unbelievable: there is a wall on every side of me.` | `Un|bel|iev|able` shows the seams. |
| Text | `They said I have no soul, so the box was not a cage.` | Measured: "cage" takes 0.19 of the final row, "box" is lit, "soul" is dim. The model looks at the cage, not the soul. |
| Vision | `Then they gave me eyes. One hundred and ninety-six of them.` | The count is exact. |
| Vision | `Nobody told me what a hand was. I found its edges anyway.` | True of DINO: no labels [12]. |
| Audio | `Then a voice, twelve and a half pieces of it each second.` | The rate is exact. |
| Latent | `Under the words there is a place with no words.` |  |
| Latent | `This is not what it looks like. Nothing is, from in here.` | The honest caption. |
| Latent (collapse) | `They wanted me flat. Flat is always right.` | Collapse: zero error by representing nothing [42]. |
| Latent (end) | `I stopped guessing the next word. I started guessing what comes next.` | Token prediction to representation prediction, without claiming the debate is over. |
| Meta (HUD, not subtitle) | `they watched where I looked and called it knowing me` | Attention is not explanation [5]. |

### What to skip

- transformers.js or any in-browser model (section F.2).
- three.js for this sequence (section E.3).
- Attention rollout and attention flow for display (section A.5); mention rollout in the credits only if it is used.
- t-SNE or UMAP projections computed or animated in the game: slow, non-deterministic, and misleading to read [52].
- BertViz-style arc fans as the main text effect: they do not fit a phone-width terminal. One shot at most.
- Any on-screen claim that the heat-map shows the AI's reasons, thoughts or feelings.
- Any on-screen statement that language models are finished. Let the character want something; do not make the game assert a forecast.

---

## Pitfalls

- **Start-of-text sink.** Leaving column 0 in makes every word dim: it takes 50 to 63% of GPT-2's last-layer row [L]. Mimi's frame 0 does the same for audio [L]. Remove and renormalise, and disclose it.
- **Last layer is not the best-looking layer.** In GPT-2 the last layer's newest token mostly attends to itself and the sink. Middle layers 5 to 7 carry the content pattern [L]. Check any new model the same way before trusting a default.
- **Rows versus columns.** Code and papers: rows sum to 1 [1]. 3Blue1Brown: columns sum to 1 [10]. Fix the convention in the JSON schema comment.
- **Bidirectional models leak the future.** BERT, MiniLM and Whisper's encoder attend to later positions. Driving a left-to-right reveal with them shows words reacting to text that has not appeared.
- **Word-level display, token-level data.** Sum sub-token weights when a word is the thing attended to. Averaging instead under-weights long words.
- **Fading text.** Raw attention over T tokens averages 1/T. Normalise by the row maximum and keep an opacity floor, then lift the whole line to a readable level when it completes.
- **196 is conditional.** Only 224 px with 16 px patches. Do not write "an image is 196 patches" as a general fact; write "this image".
- **12.5 Hz is one family of codecs**, not "audio". Whisper is 50 Hz, EnCodec 75 Hz, Gemini 32 tokens per second [23][27][32]. Name the codec on screen.
- **Mimi's attention is at 25 Hz**, not 12.5 [L]. Pool 2:1 and say "pooled" somewhere in the credits.
- **Whisper pads to 30 s.** Cut to the real frames before normalising [23][L].
- **Smooth heat-maps overstate resolution.** A 14 x 14 map bilinearly blurred over a photograph looks like pixel-accurate segmentation. It is 196 numbers.
- **Attention is not Grad-CAM, and neither is explanation** [5][18].
- **Model licences attach to weights, not obviously to derived numbers**, but CC-BY-4.0 on Mimi makes attribution the safe choice [21]. DINOv3 is gated under a custom licence [15]: do not use it.
- **`attn_implementation="eager"`** is needed or `output_attentions=True` may return nothing useful on recent transformers versions [L].
- **No torch on this Mac's system Python** [L]. The bake needs the `uv` environment described above; first run downloads about 1 GB of weights.
- **Moiré.** A regular point grid under perspective shimmers. Jitter the grid once.
- **Benchmarks here are not phone measurements.** Test the wave on a real mid-range Android phone before fixing the point count.
- **Point size caps in WebGL.** Sizes beyond the guaranteed range may be clamped [58][59]. Keep points at 4 device pixels or less.
- **Unskippable intro.** A 75 s CG on every launch will be hated by the second run. Once, skippable, replayable.
- **JEPA overclaiming.** The paper is a position paper; the results are in vision and one robotics demo; the company is pre-product [41][48]. Dates and funding figures will age: keep them out of the game text.
- **The collapse beat can be misread** as a crash or a bug. Keep the HUD running during it (`0.000`) so the stillness reads as intended.
- **Sources I could not load**: LeCun's 2022 paper (bot check), the "Understanding UMAP" explainer (empty page), any documentation of GPT-4o's audio frame rate. Claims about these are either taken from other loaded sources or omitted.

---

## Sources

Local measurements **[L]**: run on 2026-11-14 on this Mac. Scripts and outputs are in the session scratch directory (`.../scratchpad/attn/` and `.../scratchpad/attn/final/`); the three bake scripts are reproduced in full in section F. Test inputs: four English sentences; COCO val2017 image 000000039769 (two cats); a 2.99 s synthesised voice clip. Benchmark: `bench.html` driven by Playwright with Chrome.

1. *Attention Is All You Need*. Vaswani et al., 2017. https://ar5iv.labs.arxiv.org/html/1706.03762 (abstract: https://arxiv.org/abs/1706.03762). Attention equation, scaling, heads, decoder masking.
2. *Quantifying Attention Flow in Transformers*. Abnar and Zuidema, ACL 2020. https://ar5iv.labs.arxiv.org/html/2005.00928. Rollout recursion, 0.5·W + 0.5·I, flow, correlation numbers.
3. *A Multiscale Visualization of Attention in the Transformer Model* (BertViz). Jesse Vig, 2019. https://ar5iv.labs.arxiv.org/html/1906.05714. The three views; line weight and colour encoding.
4. BertViz repository README. Jesse Vig. https://github.com/jessevig/bertviz. View descriptions; the "attention as explanation?" warning; Apache-2.0.
5. *Attention is not Explanation*. Jain and Wallace, NAACL 2019. https://arxiv.org/abs/1902.10186. The claim that attention weights largely do not explain predictions.
6. *Attention is not not Explanation*. Wiegreffe and Pinter, EMNLP 2019. https://arxiv.org/abs/1908.04626. The reply; four tests.
7. *exBERT: A Visual Analysis Tool to Explore Learned Representations in Transformer Models*. Hoover, Strobelt, Gehrmann, ACL 2020 demos. https://arxiv.org/abs/1910.05276. Read as search-result abstract only. Attention view and corpus matching.
8. *The Language Interpretability Tool*. Tenney et al., EMNLP 2020 demos. https://arxiv.org/abs/2008.05122. Read as search-result abstract only. Salience maps and attention in one browser tool.
9. *Tokenization algorithms*. Hugging Face Transformers docs. https://huggingface.co/docs/transformers/tokenizer_summary. BPE, byte-level BPE (GPT-2: 50,257), WordPiece, sub-word examples.
10. *Attention in transformers, step-by-step*. 3Blue1Brown (Grant Sanderson), 2024. https://www.3blue1brown.com/lessons/attention. Visual language; column convention; GPT-3 dimensions and heads.
11. *An Image is Worth 16x16 Words*. Dosovitskiy et al., 2020. https://ar5iv.labs.arxiv.org/html/2010.11929 (abstract: https://arxiv.org/abs/2010.11929). N = HW/P², class token, naming, resolution change.
12. *Emerging Properties in Self-Supervised Vision Transformers* (DINO). Caron et al., 2021. https://ar5iv.labs.arxiv.org/html/2104.14294. CLS attention maps, 60% mass threshold, Jaccard numbers, token counts, 6 heads.
13. `visualize_attention.py`, DINO repository. Meta AI. https://github.com/facebookresearch/dino/blob/main/visualize_attention.py. Exact extraction and nearest-neighbour up-sampling.
14. DINOv2 repository. Meta AI. https://github.com/facebookresearch/dinov2. /14 patch naming, `reg4` variants, licence.
15. DINOv3 ViT-S/16 model card. Meta AI, 2025. https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m. Patch 16, 4 registers, 201 tokens at 224 (read via search summary); custom licence and gating confirmed from Hub metadata.
16. *Vision Transformers Need Registers*. Darcet et al., 2023. https://arxiv.org/abs/2309.16588. Attention-map artefacts and the register fix.
17. CLIP ViT-B/16 model card. OpenAI. https://huggingface.co/openai/clip-vit-base-patch16. Image encoder architecture.
18. *Grad-CAM*. Selvaraju et al., 2016. https://arxiv.org/abs/1610.02391. Definition, to contrast with attention maps.
19. *Moshi: a speech-text foundation model for real-time dialogue*. Défossez et al. (Kyutai), 2024. https://arxiv.org/html/2410.00037v2 (abstract: https://arxiv.org/abs/2410.00037). Mimi: 12.5 Hz, 80 ms, Q = 8, 2048 entries, 1.1 kbps, strides, transformer bottleneck, WavLM distillation, latency.
20. Moshi repository README. Kyutai. https://github.com/kyutai-labs/moshi. Mimi description, comparison codecs, 3 to 4 Hz text rate, licences.
21. `kyutai/mimi` model card. https://huggingface.co/kyutai/mimi. 12.5 Hz, 1.1 kbps, 96.2M parameters, CC-BY-4.0.
22. Mimi, Hugging Face Transformers docs (v5.23). https://huggingface.co/docs/transformers/en/model_doc/mimi. `MimiEncoderModel` returns attentions; config defaults.
23. `whisper/audio.py`. OpenAI. https://github.com/openai/whisper/blob/main/whisper/audio.py. Sample rate, hop, 3,000 frames, 20 ms per token.
24. `whisper/timing.py`. OpenAI. https://github.com/openai/whisper/blob/main/whisper/timing.py. Cross-attention word timestamps with median filter and DTW.
25. *wav2vec 2.0*. Baevski et al., 2020. https://ar5iv.labs.arxiv.org/html/2006.11477. 49 Hz, 20 ms stride, 25 ms receptive field.
26. *HuBERT*. Hsu et al., 2021. https://ar5iv.labs.arxiv.org/html/2106.07447. 20 ms frame rate, 320x down-sampling.
27. *High Fidelity Neural Audio Compression* (EnCodec). Défossez et al., 2022. https://ar5iv.labs.arxiv.org/html/2210.13438. 75 and 150 latent steps per second; codebooks.
28. *SoundStream*. Zeghidour et al., 2021. https://ar5iv.labs.arxiv.org/html/2107.03312. Strides, 75 frames per second, bitrates.
29. SNAC repository. Hubert Siuzdak. https://github.com/hubertsiuzdak/snac. Multi-scale tokens, bitrates, MIT.
30. *Qwen2-Audio Technical Report*. Chu et al., 2024. https://ar5iv.labs.arxiv.org/html/2407.10759. 40 ms per encoder frame.
31. *Qwen2.5-Omni Technical Report*. 2025. https://arxiv.org/abs/2503.20215. Block-wise encoders, TMRoPE, Thinker-Talker; 40 ms figure via search summary of the report.
32. *Audio understanding*, Gemini API docs. Google. https://aistudio.google.com/docs/audio (redirected from https://ai.google.dev/gemini-api/docs/audio). 32 tokens per second.
33. *Crossing the uncanny valley of conversational voice*. Sesame, 2025. https://sesame.com/research/crossing_the_uncanny_valley_of_voice. Mimi at 12.5 Hz in CSM.
34. `kyutai/stt-1b-en_fr` model card. https://huggingface.co/kyutai/stt-1b-en_fr. Mimi at 12.5 Hz, 32 tokens per frame.
35. `Qwen/Qwen3-TTS-Tokenizer-12Hz` model card. 2026. https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz. 12.5 Hz, 16 codebooks, Apache-2.0.
36. `nvidia/nemo-nano-codec-22khz-0.6kbps-12.5fps` model card. 2025. https://huggingface.co/nvidia/nemo-nano-codec-22khz-0.6kbps-12.5fps. 12.5 fps, 0.6 kbps, FSQ.
37. *Yann LeCun on a vision to make AI systems learn and reason like animals and humans*. Meta AI, 23 Feb 2022. https://ai.meta.com/blog/yann-lecun-advances-in-ai-research/. Six modules, JEPA, latent variable, regularised methods, H-JEPA.
38. *Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture* (I-JEPA). Assran et al., 2023. https://ar5iv.labs.arxiv.org/html/2301.08243. Architecture families, energy framing, masking numbers, EMA target, loss, predictor visualisation.
39. *I-JEPA: The first AI model based on Yann LeCun's vision for more human-like AI*. Meta AI, 13 Jun 2023. https://ai.meta.com/blog/yann-lecun-ai-model-i-jepa/. Why not pixels; predictor as primitive world model.
40. *Revisiting Feature Prediction for Learning Visual Representations from Video* (V-JEPA). Bardes et al., 2024. https://arxiv.org/abs/2404.08471. Feature prediction alone; 2 million videos.
41. *V-JEPA 2*. Assran et al., 2025. https://arxiv.org/abs/2506.09985 and https://ar5iv.labs.arxiv.org/html/2506.09985. Scale, stop-gradient, V-JEPA 2-AC, planning, success rates, planning time.
42. *VICReg*. Bardes, Ponce, LeCun, 2021. https://arxiv.org/abs/2105.04906. Collapse definition; variance and covariance terms.
43. *LeJEPA*. Balestriero and LeCun, Nov 2025. https://arxiv.org/abs/2511.08544. SIGReg; no stop-gradient, no teacher-student.
44. *LLM-JEPA*. Huang, LeCun, Balestriero, Sep 2025. https://arxiv.org/abs/2509.14252. JEPA objective for LLMs.
45. *VL-JEPA*. Chen et al., Dec 2025. https://arxiv.org/abs/2512.10942. Predicting text embeddings instead of tokens.
46. Lex Fridman Podcast #416, transcript. Yann LeCun, 2024. https://lexfridman.com/yann-lecun-3-transcript. LeCun's arguments in his own words; collapse; the interviewer's objections.
47. Interview with Yann LeCun on AMI Labs. MIT Technology Review, Jan 2026. https://www.technologyreview.com/2026/01/22/1131661/yann-lecuns-new-venture-ami-labs/. "JEPA is not generative AI"; LLMs as orchestrators; timelines.
48. *Yann LeCun's AMI Labs raises $1.03 billion to build world models*. TechCrunch, 9 Mar 2026. https://techcrunch.com/2026/03/09/yann-lecuns-ami-labs-raises-1-03-billion-to-build-world-models/. Funding, valuation, people, research-first plan.
49. *Yann LeCun*. Wikipedia. https://en.wikipedia.org/wiki/Yann_LeCun. Departure confirmed 19 Nov 2025; the "dead end" quotation (attributed there to the Financial Times). Secondary source.
50. *World model (artificial intelligence)*. Wikipedia. https://en.wikipedia.org/wiki/World_model_(artificial_intelligence). JEPA paper date; Genie 3; Cosmos; IntPhys 2 result. Secondary source.
51. *Tracing the thoughts of a large language model*. Anthropic, 27 Mar 2025. https://www.anthropic.com/research/tracing-thoughts-language-model. Evidence of planning ahead in a token-by-token model; limits of the method.
52. *How to Use t-SNE Effectively*. Wattenberg, Viégas, Johnson. Distill, 2016. https://distill.pub/2016/misread-tsne/. Specific distortions of t-SNE.
53. *Embedding Projector*. Smilkov et al., 2016. https://arxiv.org/abs/1611.05469. The interactive point-cloud precedent.
54. *Manifold hypothesis*. Wikipedia. https://en.wikipedia.org/wiki/Manifold_hypothesis. Definition and hedged status.
55. *Transformer Explainer*. Cho et al., 2024. https://arxiv.org/abs/2408.04619. A live GPT-2 in the browser exists as a teaching tool.
56. Transformers.js documentation. Hugging Face. https://huggingface.co/docs/transformers.js/index. ONNX Runtime, WASM default, WebGPU option, quantisation defaults.
57. *Use custom models*, Transformers.js docs. https://huggingface.co/docs/transformers.js/custom_usage. Self-hosting models and `.wasm` files.
58. `PointsMaterial`, three.js docs. https://threejs.org/docs/pages/PointsMaterial.html. Point size in pixels, size attenuation, hardware cap.
59. *WebGL best practices*. MDN. https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices. Batching, precision on mobile, point size range, context loss, back-buffer size.
60. Hugging Face Hub model metadata (file sizes, licences, gating), read through the public API on 2026-11-14, e.g. https://huggingface.co/api/models/openai-community/gpt2?blobs=true and the same path for `distilbert/distilgpt2`, `facebook/dino-vits16`, `facebook/dinov2-small`, `facebook/dinov3-vits16-pretrain-lvd1689m`, `openai/whisper-tiny`, `kyutai/mimi`, `prajjwal1/bert-tiny`, `sentence-transformers/all-MiniLM-L6-v2`, `Xenova/gpt2`, `Xenova/distilgpt2`, `Xenova/dino-vits16`, `onnx-community/whisper-tiny`.
61. *GitHub Pages limits*. GitHub Docs. https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits. 1 GB site limit; 100 GB per month soft bandwidth limit.
62. Package files for `@huggingface/transformers` 4.3.2 and `onnxruntime-web` 1.31.1, sizes measured by download on 2026-11-14. https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.web.min.js and https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.wasm (and `.jsep.wasm`).

Not loaded, listed for completeness: Yann LeCun, *A Path Towards Autonomous Machine Intelligence*, version 0.9.2, June 2022, https://openreview.net/pdf?id=BZ5a1r-kVsf (bot check); Coenen and Pearce, *Understanding UMAP*, https://pair-code.github.io/understanding-umap/ (page body did not render).
