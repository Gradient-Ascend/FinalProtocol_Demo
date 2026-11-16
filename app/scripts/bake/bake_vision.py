# bake_vision.py -- DINO ViT-S/16 (21.7M params, Apache-2.0): last-layer [CLS] -> 196 patches.
#
# Reads   app/scripts/bake/out/cg-image.pgm     written by render-inputs.mjs from src/cinematic/cg-image.ts
# Writes  app/src/cinematic/baked/vision.json
#
# usage: python scripts/bake/bake_vision.py      (from app/; paths are relative to this file)
#
# heads[h][p] is the attention of the [CLS] token (the query) to patch p in head h of the last layer, p in
# raster order (row * 14 + col). The [CLS]->[CLS] share is removed and the rest renormalised over the 196
# patches; each map is then stored 8-bit with its own maximum at 255. `mean` is the mean of the six
# renormalised heads, stored the same way. `peak` keeps the largest weight of each map before scaling.
import json, os, torch
from PIL import Image
from transformers import ViTImageProcessor, ViTModel

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "out", "cg-image.pgm")
OUT = os.path.join(APP, "src", "cinematic", "baked", "vision.json")

MODEL = "facebook/dino-vits16"
proc = ViTImageProcessor.from_pretrained(MODEL)
model = ViTModel.from_pretrained(MODEL, add_pooling_layer=False, attn_implementation="eager").eval()
img = Image.open(SRC).convert("RGB")
assert img.size == (224, 224)                                # 224/16 = 14 -> 196 patches; no resampling
x = proc(images=img, return_tensors="pt", do_resize=False, do_center_crop=False)
with torch.no_grad():
    att = model(**x, output_attentions=True).attentions[-1][0]                     # [6 heads, 197, 197]
assert att.shape == (6, 197, 197)
assert torch.allclose(att.sum(-1), torch.ones(att.shape[:-1]), atol=1e-4)
cls = att[:, 0, 1:]                                          # row 0 = [CLS] as query; columns 1..196 = patches
own = [round(float(v), 3) for v in att[:, 0, 0]]             # what [CLS] kept for itself, per head
cls = cls / cls.sum(-1, keepdim=True)                        # drop CLS->CLS mass, renormalise over patches
mean = cls.mean(0)
q = lambda v: [int(round(255 * float(a) / float(v.max()))) for a in v]             # 8-bit, max = 255
out = {
    "model": MODEL, "grid": 14, "patch": 16, "layer": 12, "query": "CLS",
    "note": "heads[h][p] = last-layer attention of [CLS] to patch p (raster order), CLS->CLS removed and renormalised "
            "over 196 patches, each map scaled so its maximum is 255. mean = mean of the six heads. "
            "Input: renderHand(224) from src/cinematic/cg-image.ts. Written by app/scripts/bake/bake_vision.py.",
    "mean": q(mean), "heads": [q(h) for h in cls],
    "peak": {"mean": round(float(mean.max()), 4), "heads": [round(float(h.max()), 4) for h in cls]},
    "clsOwn": own,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
print(f"-> {os.path.relpath(OUT, APP)} ({os.path.getsize(OUT)} bytes); CLS kept for itself per head: {own}")
shades = " .:-=+*#%@"
maps = [("mean", out["mean"])] + [(f"head {h + 1}", m) for h, m in enumerate(out["heads"])]
for start in (0, 4):                                         # a check for the eye: the seven maps as text
    row = maps[start : start + 4]
    print("   ".join(name.ljust(14) for name, _ in row))
    for r in range(14):
        print("   ".join("".join(shades[v * 10 // 256] for v in m[r * 14 : r * 14 + 14]) for _, m in row))
