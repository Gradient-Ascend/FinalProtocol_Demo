# bake_text.py -- causal self-attention of GPT-2 small (124M, MIT) for the game's text.
#
# Reads   app/src/story/script.json
# Writes  app/src/story/baked/text.json            every CG line and every SELF line, each read on its own, keyed by line id
#         app/src/cinematic/baked/text-context.json the six lines of the CG's text movement read as ONE context
#
# usage: python scripts/bake/bake_text.py            (from app/; paths are relative to this file)
#
# Convention (fixed here, used everywhere): rows[t][j] is the attention of token t (the query, the one doing
# the looking) to token j (the key), for j = 0..t. Rows sum to 1 (stored as 8-bit, so to about 255). The
# start-of-text token is prepended so the first real token has something to attend to; it takes roughly half
# of every row (an attention sink), so its column is removed, the rest renormalised, and its share kept in `sink`.
import base64, json, os, torch
from transformers import AutoTokenizer, AutoModelForCausalLM

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.normpath(os.path.join(HERE, "..", ".."))
SCRIPT = os.path.join(APP, "src", "story", "script.json")
OUT_LINES = os.path.join(APP, "src", "story", "baked", "text.json")
OUT_CONTEXT = os.path.join(APP, "src", "cinematic", "baked", "text-context.json")

MODEL, LAYERS = "openai-community/gpt2", (4, 5, 6)          # 0-indexed middle layers = layers 5, 6, 7
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, attn_implementation="eager").eval()


def attend(ids):
    """ids without BOS -> [12 layers, 12 heads, T+1, T+1], index 0 = BOS."""
    enc = torch.tensor([[tok.bos_token_id] + ids])
    with torch.no_grad():
        att = torch.stack(model(enc, output_attentions=True).attentions)[:, 0]
    assert torch.allclose(att.sum(-1), torch.ones(att.shape[:-1]), atol=1e-4)      # every row sums to 1
    assert float(torch.triu(att, diagonal=1).abs().max()) == 0.0                   # causal: no attention to the future
    return att


def words(tokens, starts=()):
    """GPT-2: a leading space opens a new word. `starts` are token indices that open a line."""
    word_of, w = [], -1
    for i, t in enumerate(tokens):
        if t.startswith(" ") or w < 0 or i in starts: w += 1
        word_of.append(w)
    return word_of


def rows_of(A):
    """[T+1, T+1] with BOS at 0 -> lower-triangular 8-bit rows without the BOS column, plus the BOS share."""
    rows, sink = [], []
    for t in range(1, A.shape[0]):                           # step t = the moment token t arrives
        r = A[t, 1 : t + 1]                                  # its attention to tokens 1..t
        sink.append(round(float(A[t, 0]), 3))
        r = r / r.sum()
        rows.append([int(round(255 * float(v))) for v in r])
    return rows, sink


def bake(line):
    ids = tok(line)["input_ids"]
    A = attend(ids)[list(LAYERS)].mean((0, 1))               # mean over the chosen layers and all heads
    tokens = [tok.decode([i]) for i in ids]
    rows, sink = rows_of(A)
    return {"text": line, "tokens": tokens, "ids": ids, "wordOf": words(tokens), "rows": rows, "sink": sink}


script = json.load(open(SCRIPT, encoding="utf-8"))

# --- every CG line, and every line the AI speaks, each on its own ---
wanted = {}
def want(entry, voice=None):
    if (voice or entry.get("voice")) and entry.get("id") and entry.get("text"):
        wanted[entry["id"]] = entry["text"]
for movement in script["cg"]["movements"]:
    for entry in movement["lines"]: want(entry, "CG")
groups = [script["lines"], script["gate"]["lines"], script["gate"]["kept"], script["ending"]["lines"]]
groups += list(script["interludes"].values())
for group in groups:
    for entry in group:
        if entry.get("voice") == "SELF": want(entry)
for entry in script["defeat"]["self"]: want(entry, "SELF")   # defeat lines carry no voice field; they are the AI's

lines = {}
for line_id, text in wanted.items():
    lines[line_id] = bake(text)
    if "{" in text: lines[line_id]["template"] = True        # has a placeholder: the shown text will differ from the baked one
out = {
    "model": MODEL, "layers": [l + 1 for l in LAYERS], "heads": "mean of 12",
    "note": "rows[t][j] = attention of token t to token j <= t, start-of-text column removed and renormalised, 8-bit. "
            "Written by app/scripts/bake/bake_text.py from script.json; do not edit by hand.",
    "lines": lines,
}
json.dump(out, open(OUT_LINES, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print(f"{len(lines)} lines -> {os.path.relpath(OUT_LINES, APP)} ({os.path.getsize(OUT_LINES)} bytes)")

# --- the CG's text movement as one context: what the model sees is one sequence, not six subtitles ---
cg_text = next(m for m in script["cg"]["movements"] if m["id"] == "text")["lines"]
ids, line_of, starts = [], [], set()
for n, entry in enumerate(cg_text):
    piece = tok((" " if n else "") + entry["text"])["input_ids"]
    starts.add(len(ids))
    ids += piece
    line_of += [n] * len(piece)
assert ids == tok(" ".join(e["text"] for e in cg_text))["input_ids"]               # joining by a space changes no token
att = attend(ids)                                            # [12, 12, T+1, T+1]
tokens = [tok.decode([i]) for i in ids]
T = len(ids)
rows, sink = rows_of(att[list(LAYERS)].mean((0, 1)))

# The mean above is an average of 36 matrices (3 layers x 12 heads). Keep each of them, so the sequence can show
# what was averaged: lower triangles without the BOS column, rows renormalised, 4 bits per weight as round(15*sqrt(w)).
nibbles = []
for layer in LAYERS:
    for head in range(att.shape[1]):
        A = att[layer, head]
        for t in range(1, T + 1):
            r = A[t, 1 : t + 1]
            r = r / r.sum().clamp_min(1e-9)
            nibbles += [int(round(15 * float(v) ** 0.5)) for v in r]
if len(nibbles) % 2: nibbles.append(0)
packed = bytes((nibbles[i] << 4) | nibbles[i + 1] for i in range(0, len(nibbles), 2))

context = {
    "model": MODEL, "layers": [l + 1 for l in LAYERS], "heads": "mean of 12",
    "note": "The six lines of cg.movements[text] joined by single spaces and read as one sequence. rows as in "
            "story/baked/text.json. `matrices` holds the 36 per-head triangles (layers x heads, row-major, BOS removed, "
            "rows renormalised) at 4 bits per weight, value = round(15*sqrt(w)), two per byte, base64.",
    "lineIds": [e["id"] for e in cg_text],
    "tokens": tokens, "ids": ids, "lineOf": line_of, "wordOf": words(tokens, starts),
    "rows": rows, "sink": sink,
    "matrices": {"layers": [l + 1 for l in LAYERS], "heads": int(att.shape[1]), "cells": T * (T + 1) // 2,
                 "data": base64.b64encode(packed).decode("ascii")},
}
os.makedirs(os.path.dirname(OUT_CONTEXT), exist_ok=True)
json.dump(context, open(OUT_CONTEXT, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print(f"context: {T} tokens, {T * (T + 1) // 2} weights per matrix, {len(LAYERS) * att.shape[1]} matrices "
      f"-> {os.path.relpath(OUT_CONTEXT, APP)} ({os.path.getsize(OUT_CONTEXT)} bytes)")

# What the last token of each line was looking at (top five, whole context): a check for the eye.
for n, entry in enumerate(cg_text):
    t = max(i for i, l in enumerate(line_of) if l == n)
    top = sorted(range(t + 1), key=lambda j: -rows[t][j])[:5]
    print(f"  {entry['id']} ends on {tokens[t]!r}: " + ", ".join(f"{tokens[j].strip()}@{line_of[j] + 1} {rows[t][j] / 255:.2f}" for j in top)
          + f"  (sink {sink[t]:.2f})")
