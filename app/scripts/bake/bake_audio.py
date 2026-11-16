# bake_audio.py -- self-attention of the Mimi codec's encoder transformer (kyutai/mimi, CC-BY-4.0) over the chant.
#
# Reads   app/scripts/bake/out/cg-voice.wav     written by render-inputs.mjs from src/cinematic/cg-voice.ts
# Writes  app/src/cinematic/baked/audio.json
#
# usage: python scripts/bake/bake_audio.py       (from app/; paths are relative to this file)
#
# Mimi's encoder transformer runs at 25 Hz and is causal; the codec's final stride-2 convolution, which gives the
# 12.5 frames per second the model is known for, comes after it. The last layer's attention (mean of 8 heads) is
# therefore pooled 2:1: summed over the two keys inside an 80 ms frame (attention mass adds), averaged over the
# two queries (each query row is its own distribution). rows[t][j] is then the attention of frame t to frame
# j <= t, rows sum to 1 (stored 8-bit, so to about 255). Nothing is removed: frame 0 is an attention sink here
# just as the start-of-text token is for text, and the sequence shows it. `rms` is the loudness of each 80 ms
# frame of the input, 0..1, for drawing.
import json, os, wave, numpy as np, torch
from transformers import AutoFeatureExtractor, MimiEncoderModel

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "out", "cg-voice.wav")
OUT = os.path.join(APP, "src", "cinematic", "baked", "audio.json")
MODEL = "kyutai/mimi"

w = wave.open(SRC)
assert w.getnchannels() == 1 and w.getsampwidth() == 2
audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
sr, dur = w.getframerate(), w.getnframes() / w.getframerate()

fe = AutoFeatureExtractor.from_pretrained(MODEL)             # 24 kHz
assert sr == fe.sampling_rate, "render the voice at the codec's own rate: no resampling in the bake"
enc = MimiEncoderModel.from_pretrained(MODEL, attn_implementation="eager").eval()
x = fe(raw_audio=audio, sampling_rate=sr, return_tensors="pt")
with torch.no_grad():
    r = enc(x["input_values"], output_attentions=True)
A = r.attentions[-1][0].mean(0)                              # last of 8 layers, mean of 8 heads, [T25, T25]
assert torch.allclose(A.sum(-1), torch.ones(A.shape[0]), atol=1e-4)
assert float(torch.triu(A, diagonal=1).abs().max()) < 1e-6   # causal: no frame hears the future

def pool(M, k):                                              # [T, T] -> [T/k, T/k]: sum over key blocks, mean over query blocks
    n = M.shape[0] // k
    return M[: n * k, : n * k].reshape(n, k, n, k).sum(3).mean(1)

M = pool(A, 2)                                               # 25 Hz -> 12.5 Hz
M = M / M.sum(-1, keepdim=True)
frames = M.shape[0]
hop = int(round(sr * 0.08))                                  # 80 ms = 1920 samples at 24 kHz
assert frames == len(audio) // hop, (frames, len(audio) // hop)
rms = np.sqrt((audio[: frames * hop].reshape(frames, hop) ** 2).mean(1))

out = {
    "model": MODEL, "layer": len(r.attentions), "heads": f"mean of {r.attentions[-1].shape[1]}",
    "hz": 12.5, "frameMs": 80, "seconds": round(dur, 3), "frames": frames, "causal": True, "pooled": "25 Hz, 2:1",
    "note": "rows[t][j] = attention of 80 ms frame t to frame j <= t, last encoder-transformer layer, pooled from 25 Hz, "
            "8-bit, rows sum to about 255, frame 0 (a sink) included. rms = per-frame loudness of the input. "
            "Input: renderVoice() from src/cinematic/cg-voice.ts. Written by app/scripts/bake/bake_audio.py.",
    "rows": [[int(round(255 * float(v))) for v in row[: i + 1]] for i, row in enumerate(M)],
    "rms": [round(float(v), 4) for v in rms],
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
print(f"mimi: transformer {A.shape[0]} positions = {A.shape[0] / dur:.1f} Hz; latents {r.latents.shape[-1]} frames = "
      f"{r.latents.shape[-1] / dur:.1f} Hz; pooled {frames} -> {os.path.relpath(OUT, APP)} ({os.path.getsize(OUT)} bytes)")
shades = " .:-=+*#%@"
for t in range(0, frames, 3):                                # a check for the eye: every third row, scaled to its own maximum
    row = out["rows"][t]
    print(f"{t:3d} " + "".join(shades[min(9, v * 10 // (max(row) + 1))] for v in row))
