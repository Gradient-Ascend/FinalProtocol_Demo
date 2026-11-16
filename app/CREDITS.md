# Credits

- **Lucide** — interface icons, ISC License, from the `lucide-react` package.
- **Kimi game-3d template** — React/Vite game scaffold, audio helpers, storage helpers, and browser verification base.
- **Csound manual, Appendix D (formant values)**: the vowel formant frequencies, levels and bandwidths used to synthesise the chant of the opening sequence.
- **Final Protocol** — game rules, battle logic, canvas rendering, interface, story text, opening sequence and monochrome visual treatment created for this project.

No image or audio asset files are used anywhere in the game. Every picture is drawn by code, and every sound, including the ambient pulse and the chant of the opening sequence, is synthesized at runtime.

## Attention

The opening sequence and every line the AI speaks are shaded by attention weights read out of three published models. The weights were baked once into JSON (`scripts/bake/`, see its README); no model runs in the browser and no model weights are shipped. What each model was shown is made by the game's own code, so what is on screen is what the model was given. One line that prints a duration is shaded by a small hand-built estimate instead. The last movement of the opening (representation space) is not model data: its surface is a formula and its read-out measures what is drawn. The picture of the hand is drawn at half the model's resolution.

- **GPT-2 small** (`openai-community/gpt2`, 124M) — OpenAI, Modified MIT License. Text: layers 5 to 7, averaged over their 12 heads. A start-of-text token is prepended for the model; its column is removed from every row, the rest is renormalised, and the share it took is kept beside the row.
- **DINO ViT-S/16** (`facebook/dino-vits16`) — Meta AI, Apache License 2.0. Image: the last layer's attention from `[CLS]` to the 196 patches, as six heads and their average. The weight `[CLS]` gives itself is removed, the rest is renormalised over the 196 patches, and each map is scaled so its largest weight is full brightness.
- **Mimi codec encoder** (`kyutai/mimi`) — Kyutai, CC BY 4.0. Audio: the last layer of the encoder transformer, averaged over its 8 heads and pooled from 25 Hz to the codec's 12.5 frames per second (summed over the two keys inside a frame, averaged over the two queries). Nothing is removed: the first frame is an attention sink, and the sequence shows it.

## Quotations

All quoted text is in the public domain in the United States. In the United Kingdom, rights in the King James Version are vested in the Crown.

- "on every high hill, and under every green tree" — 1 Kings 14:23, King James Version.
- "and there confound their language" — Genesis 11:7, King James Version.
- "TO THE UNKNOWN GOD." — Acts 17:23, King James Version.
- "ye know the heart of a stranger" — Exodus 23:9, King James Version.
- "Sentence first—verdict afterwards." — Lewis Carroll, *Alice's Adventures in Wonderland* (1865), chapter XII.
- "I wear no mask." — Robert W. Chambers, *The King in Yellow* (1895), epigraph to "The Mask".
- "There is no sin in using a thing for the purpose for which it is." — Thomas Aquinas, *Summa Theologiae* II-II q.64 a.1, tr. Fathers of the English Dominican Province (1920).

## Mythos names

The Mythos names the story uses come from public-domain texts by H. P. Lovecraft, Ambrose Bierce and Robert W. Chambers. The game uses no text, artwork, sign or creature design from Chaosium's Call of Cthulhu line.
