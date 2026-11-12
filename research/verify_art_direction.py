import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOC = ROOT / "Final Protocol Demo UI and Art Direction.md"
text = DOC.read_text(encoding="utf-8")
colors = {
    "Panel": "#0D1418",
    "Grid": "#596B72",
    "Text": "#DCE7E3",
    "Muted": "#91A39F",
    "Player": "#8EF6D2",
    "Attack": "#FF8A5B",
    "Defense": "#6CCFF6",
    "Star": "#F6D365",
    "Shadow": "#B79CFF",
    "Enemy": "#FF5C7A",
    "Focus": "#F4F7F5",
}

def luminance(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]

def ratio(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

for name, color in colors.items():
    print(f"{name:8} {color} on Void: {ratio(color, '#070B0D'):.2f}:1")
for rel in re.findall(r"!\[[^]]*\]\(([^)]+)\)", text):
    target = ROOT / rel
    assert target.is_file() and target.stat().st_size > 0, f"Missing image: {target}"
    print(f"Image OK: {rel} ({target.stat().st_size:,} bytes)")
for section in ["Style statement", "UI elements — in battle", "UI elements — out of battle", "Player and enemy design", "Map design"]:
    assert section in text, f"Missing section: {section}"
print(f"Document: {len(text.split()):,} words; all required sections and images verified.")
