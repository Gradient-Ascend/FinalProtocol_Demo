import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "Final Protocol Visual Review"
PAGES = ROOT / "pages"
PAGES.mkdir(parents=True, exist_ok=True)

C = {
    "bg": "#060606", "panel": "#111111", "cell": "#0C0C0C", "wall": "#242424",
    "grid": "#343434", "line": "#414141", "text": "#EEEEEE", "muted": "#888888",
    "white": "#F5F5F5", "enemy": "#D8D8D8", "glass": "#171717E8",
    "glassEdge": "#FFFFFF24", "glassHighlight": "#FFFFFF32", "selected": "#292929F2",
}
MONO = "JetBrains Mono"
SANS = "Liter"
PIXEL = "Jersey15"


def fill(color):
    return {"type": "solid", "color": color}


def gradient(stops, kind="linear", angle=90):
    return {"type": "gradient", "gradientType": kind, "angle": angle,
            "stops": [{"position": pos, "color": col} for pos, col in stops]}


def border(color, width=1, style="solid"):
    return {"style": style, "width": width, "color": color}


class Page:
    def __init__(self, name, pixel=False):
        self.name = name
        self.pixel = pixel
        self.elements = []
        self.count = 0

    def add(self, kind, bounds, **kwargs):
        self.count += 1
        item = {"elementId": f"{self.name}-{self.count:03d}", "elementType": kind,
                "bounds": [round(v, 2) for v in bounds]}
        item.update(kwargs)
        self.elements.append(item)
        return item

    def text(self, x, y, w, h, value, size=14, color="$text", bold=False,
             align="left", valign="middle", wrap=False, spacing=0, font=MONO,
             line_height=1.2):
        return self.add("text", [x, y, w, h], content={
            "text": value, "fontSize": size, "fontFamily": font, "color": color,
            "bold": bold, "align": [align, valign], "wrap": wrap,
            "lineHeight": line_height, "letterSpacing": spacing,
        })

    def rect(self, x, y, w, h, fc=None, bc=None, bw=1, shape="rect", rotation=None,
             adjustments=None, shadow=None):
        kw = {"shapeName": shape}
        if fc:
            kw["fill"] = fc if isinstance(fc, dict) else fill(fc)
        if bc:
            kw["border"] = border(bc, bw)
        if rotation is not None:
            kw["rotation"] = rotation
        if adjustments is not None:
            kw["adjustments"] = adjustments
        if shadow is not None:
            kw["shadow"] = shadow
        return self.add("shape", [x, y, w, h], **kw)

    def custom(self, x, y, w, h, path, fc=None, bc=None, bw=1):
        kw = {"shapeName": "custom", "viewBox": [100, 100], "path": path}
        if fc:
            kw["fill"] = fill(fc)
        if bc:
            kw["border"] = border(bc, bw)
        return self.add("shape", [x, y, w, h], **kw)

    def line(self, x, y, w, h, points, color="$line", width=1, style="solid", arrows=None):
        kw = {"viewBox": [100, 100], "points": points, "curve": "sharp",
              "border": border(color, width, style)}
        if arrows:
            kw["arrow"] = arrows
        return self.add("line", [x, y, w, h], **kw)

    def save(self):
        bg = fill("$bg") if self.pixel else gradient(
            [(0, "#1A1A1A"), (0.58, "#0B0B0B"), (1, "#050505")], "radial")
        (PAGES / f"{self.name}.page").write_text(json.dumps({
            "pageType": "content", "background": bg, "elements": self.elements,
        }, indent=2), encoding="utf-8")


def glass(p, x, y, w, h, selected=False, radius=11000):
    p.rect(x, y, w, h, fc="$selected" if selected else "$glass",
           bc="#FFFFFF70" if selected else "$glassEdge", bw=1,
           shape="roundRect", adjustments=[radius],
           shadow={"blur": 20 if selected else 16, "color": "#00000080", "offset": [0, 8]})
    p.line(x+20, y+1, w-40, 1, "0,0 100,0", "$glassHighlight", 1)


def capsule(p, x, y, w, h, label):
    p.rect(x, y, w, h, fc="$white", bc="#FFFFFF", bw=1,
           shape="roundRect", adjustments=[50000],
           shadow={"blur": 16, "color": "#00000080", "offset": [0, 6]})
    p.text(x, y, w, h, label, 12, "#080808", True, align="center")


def smooth_glyph(p, kind, cx, cy, size, color="$white"):
    x, y = cx-size/2, cy-size/2
    if kind == "attack":
        p.custom(x, y, size, size,
                 "M50,8 Q55,8 58,14 L88,78 Q93,90 81,90 L19,90 Q7,90 12,78 L42,14 Q45,8 50,8 Z",
                 bc=color, bw=2)
    elif kind == "defense":
        p.rect(x, y, size, size, bc=color, bw=2, shape="roundRect", adjustments=[10000])
        p.line(x+size*.2, cy-1, size*.6, 2, "0,50 100,50", color, 2)
    elif kind == "star":
        p.custom(x, y, size, size,
                 "M50,2 Q54,38 98,50 Q54,62 50,98 Q46,62 2,50 Q46,38 50,2 Z", fc=color)
    elif kind == "shadow":
        p.rect(x, y, size, size, bc=color, bw=2, shape="ellipse")
        p.custom(x, y, size, size, "M50,0 A50,50 0 0 0 50,100 Z", fc=color)
    elif kind == "blank":
        p.rect(cx-size*.08, cy-size*.08, size*.16, size*.16, fc="$muted", shape="ellipse")


PATTERNS = {
    "attack": [
        "....X....", "...XXX...", "...XXX...", "..XXXXX..", "..XXXXX..",
        ".XXXXXXX.", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX",
    ],
    "defense": [
        "XXXXXXXXX", "X.......X", "X.......X", "X.......X", "X.XXXXX.X",
        "X.......X", "X.......X", "X.......X", "XXXXXXXXX",
    ],
    "star": [
        "....X....", "...XXX...", "...XXX...", "..XXXXX..", "XXXXXXXXX",
        "..XXXXX..", "...XXX...", "...XXX...", "....X....",
    ],
    "shadow": [
        "..XXXXX..", ".XXXXX...", "XXXXX....", "XXXXX....", "XXXXX....",
        "XXXXX....", "XXXXX....", ".XXXXX...", "..XXXXX..",
    ],
    "blank": ["XX", "XX"],
    "player": [
        "XX....XX", "X......X", "........", "..XXXX..", "..XXXX..",
        "........", "X......X", "XX....XX",
    ],
    "enemy": [
        ".XXXXXX.", "XX....XX", "X..XX..X", "X...X...", ".X...X..",
        "..X...X.", "...X...X", "XX....XX", ".XXXXXX.",
    ],
}


def draw_pattern(p, pattern, cx, cy, unit, color="$white"):
    rows = len(pattern)
    cols = max(len(row) for row in pattern)
    ox, oy = cx-cols*unit/2, cy-rows*unit/2
    for r, row in enumerate(pattern):
        for c, value in enumerate(row):
            if value == "X":
                p.rect(ox+c*unit, oy+r*unit, unit, unit, fc=color)


def pixel_glyph(p, kind, cx, cy, unit=5, color="$white"):
    draw_pattern(p, PATTERNS[kind], cx, cy, unit, color)


def player(p, cx, cy, size, color="$white", ghost=False):
    path = "M0,28 L0,0 L28,0 M72,0 L100,0 L100,28 M100,72 L100,100 L72,100 M28,100 L0,100 L0,72"
    p.custom(cx-size/2, cy-size/2, size, size, path, bc=color, bw=2)
    if not ghost:
        p.rect(cx-size*.12, cy-size*.12, size*.24, size*.24, fc=color, shape="diamond")


def enemy(p, cx, cy, size, color="$enemy"):
    path = "M25,5 Q20,5 18,10 L5,45 Q4,50 8,55 L22,90 Q24,95 30,95 L75,95 Q80,95 82,90 L95,55 Q96,50 92,45 L78,10 Q76,5 70,5 Z"
    p.custom(cx-size/2, cy-size/2, size, size, path, bc=color, bw=2)
    p.line(cx-size*.15, cy-size*.15, size*.3, size*.3, "0,0 100,100", color, 2)


def wall(p, x, y, size):
    p.rect(x, y, size, size, fc="$wall", bc="$grid", bw=1)
    p.line(x+size*.18, y+size*.18, size*.64, size*.64, "0,100 100,0", "#4A4A4A", 1)


def pixel_frame(p, x, y, w, h, selected=False):
    path = "M8,0 L92,0 L92,3 L97,3 L97,8 L100,8 L100,92 L97,92 L97,97 L92,97 L92,100 L8,100 L8,97 L3,97 L3,92 L0,92 L0,8 L3,8 L3,3 L8,3 Z"
    p.custom(x, y, w, h, path, fc="$white" if selected else "#090909",
             bc="$white" if selected else "#666666", bw=2)


def header(p, index, title, subtitle=None, pixel=False):
    if pixel:
        p.text(32, 18, 760, 36, f"{index} / {title}", 28, "$white", font=PIXEL)
        if subtitle:
            p.text(850, 24, 398, 26, subtitle, 16, "$muted", align="right", font=PIXEL)
        for x in range(32, 1248, 16):
            p.rect(x, 66, 8, 2, fc="#555555")
    else:
        p.text(32, 20, 760, 32, f"{index} / {title}", 20, "$text", True, spacing=1.2)
        if subtitle:
            p.text(850, 23, 398, 24, subtitle, 10, "$muted", align="right")
        p.line(32, 64, 1216, 1, "0,0 100,0", "#41414199", 1)


# PAGE 1 — smooth, modern, monochrome battle
p = Page("1_battle")
header(p, "01", "FINAL PROTOCOL", "SANDBOX 01  /  TURN 04  /  PLAN")
glass(p, 20, 82, 220, 500)
glass(p, 822, 82, 438, 500, radius=9000)
# Operator rail
p.text(40, 98, 180, 20, "OPERATOR", 10, "$muted", spacing=1.4)
player(p, 62, 142, 36)
p.text(94, 123, 128, 24, "42 / 60", 20, "$text", True)
p.text(94, 149, 128, 16, "HEALTH", 9, "$muted")
p.rect(40, 176, 180, 4, fc="$grid", shape="roundRect", adjustments=[50000])
p.rect(40, 176, 126, 4, fc="$white", shape="roundRect", adjustments=[50000])
p.line(40, 204, 180, 1, "0,0 100,0", "#414141AA")
p.text(40, 224, 100, 18, "ACTIONS", 10, "$muted")
p.text(140, 220, 80, 24, "4 / 7", 16, "$text", align="right")
p.text(40, 256, 100, 18, "STEPS", 10, "$muted")
p.text(140, 252, 80, 24, "3 / 4", 16, "$white", align="right")
for i in range(4):
    p.rect(42+i*32, 292, 23, 4, fc="$white" if i < 3 else "$grid",
           shape="roundRect", adjustments=[50000])
p.text(40, 328, 100, 18, "METHOD", 10, "$muted")
p.text(40, 352, 180, 26, "ROW", 18, "$text", True)
p.line(40, 394, 180, 1, "0,0 100,0", "#414141AA")
p.text(40, 416, 180, 18, "ROUTE YIELD", 10, "$muted", spacing=1.2)
smooth_glyph(p, "attack", 56, 462, 24)
p.text(84, 448, 80, 26, "ATTACK", 12, "$text")
p.text(164, 444, 56, 32, "03", 20, "$white", True, align="right")
p.text(40, 510, 180, 18, "ENDPOINT", 10, "$muted")
p.text(40, 534, 180, 24, "E5", 18, "$white", True)
# Tactical board
bx, by, cell = 322, 140, 62
previews = ["attack", "blank", "defense", "star", "shadow", "attack", "blank"]
for c in range(7):
    cx = bx+(c+.5)*cell
    smooth_glyph(p, previews[c], cx, 102, 22)
    p.text(cx-16, 120, 32, 14, chr(65+c), 9, "$muted", align="center")
for r in range(7):
    p.text(292, by+r*cell+22, 20, 18, str(r+1), 9, "$muted", align="center")
    for c in range(7):
        p.rect(bx+c*cell, by+r*cell, cell, cell, fc="$cell", bc="$grid")
for c, r in [(3,0), (3,3), (1,5), (6,2)]:
    wall(p, bx+c*cell, by+r*cell, cell)
p.line(bx+5.5*cell, by+2.5*cell, 1, 2*cell, "0,100 0,0", "$enemy", 2, "dash", [None, "arrow"])
p.line(bx+3.5*cell, by+1.5*cell, 2*cell, 1, "100,0 0,0", "$enemy", 2, "dash", [None, "arrow"])
p.line(bx+1.5*cell+20, by+4.5*cell, 3*cell-40, 1, "0,0 100,0", "$white", 3)
for kind, c, r in [
    ("attack",0,0), ("defense",2,0), ("attack",4,0), ("star",5,0),
    ("shadow",0,1), ("attack",2,1), ("blank",4,1), ("defense",6,1),
    ("star",1,2), ("blank",2,2), ("attack",4,2), ("shadow",5,2),
    ("defense",0,3), ("star",2,3), ("attack",5,3), ("blank",6,3),
    ("blank",0,4), ("attack",2,4), ("attack",3,4), ("attack",4,4),
    ("shadow",3,5), ("defense",4,5), ("star",5,5), ("attack",0,6),
    ("blank",2,6), ("shadow",4,6), ("attack",6,6),
]:
    smooth_glyph(p, kind, bx+(c+.5)*cell, by+(r+.5)*cell, 24)
for n, c in enumerate([2,3,4], start=1):
    p.text(bx+c*cell+5, by+4*cell+4, 16, 14, str(n), 9, "$white")
player(p, bx+1.5*cell, by+4.5*cell, 38)
player(p, bx+4.5*cell, by+4.5*cell, 44, ghost=True)
enemy(p, bx+5.5*cell, by+4.5*cell, 38)
enemy(p, bx+5.5*cell, by+1.5*cell, 34)
p.text(bx+5*cell+4, by+4*cell+4, 30, 14, "E01", 8, "$enemy")
p.text(bx+5*cell+4, by+1*cell+4, 30, 14, "E02", 8, "$enemy")
# Inspector
rx = 846
p.text(rx, 98, 390, 20, "ENEMY INTENT", 10, "$muted", spacing=1.4)
p.text(rx, 130, 60, 24, "E01", 16, "$white", True)
p.text(rx+72, 132, 160, 20, "PURSUIT", 11, "$text")
p.text(rx+230, 132, 160, 20, "HP 18 / 18", 11, "$text", align="right")
p.text(rx, 164, 390, 22, "F5  →  F4  →  F3", 13, "$enemy")
p.line(rx, 204, 390, 1, "0,0 100,0", "#414141AA")
p.text(rx, 224, 60, 22, "E02", 13, "$muted", True)
p.text(rx+72, 224, 318, 22, "F2  →  E2  →  D2", 11, "$muted")
p.line(rx, 270, 390, 1, "0,0 100,0", "#414141AA")
p.text(rx, 300, 390, 18, "ON COMMIT", 10, "$muted", spacing=1.4)
p.text(rx, 334, 390, 34, "3 DAMAGE", 24, "$white", True)
p.text(rx, 376, 390, 22, "ROW  /  E01", 12, "$text")
p.text(rx, 414, 250, 22, "E01 HEALTH", 10, "$muted")
p.text(rx, 440, 390, 28, "18  →  15", 20, "$text", True)
p.line(rx, 490, 390, 1, "0,0 100,0", "#414141AA")
p.text(rx, 510, 390, 40, "Everything fires from E5.", 12, "$muted", font=SANS)
p.line(32, 622, 1216, 1, "0,0 100,0", "#41414180")
p.text(32, 650, 100, 26, "Z  UNDO", 11, "$muted")
p.text(142, 650, 110, 26, "X  CLEAR", 11, "$muted")
capsule(p, 1008, 638, 240, 46, "SPACE  COMMIT")
p.save()

# PAGE 2 — explicit pixel vs smooth comparison
p = Page("2_components")
header(p, "02", "TWO RENDERING MODES", "ONE MONOCHROME SYSTEM")
p.text(42, 90, 520, 22, "OUT OF BATTLE / PIXEL", 11, "$muted", spacing=1.2)
p.text(688, 90, 520, 22, "IN BATTLE / SMOOTH", 11, "$muted", spacing=1.2)
p.line(640, 88, 1, 500, "0,0 0,100", "#41414199")
resources = [("attack","ATTACK"),("defense","DEFENSE"),("star","STAR"),("shadow","SHADOW"),("blank","BLANK")]
left_x = [92, 202, 312, 422, 532]
right_x = [718, 828, 938, 1048, 1158]
for (kind, label), lx, rx in zip(resources, left_x, right_x):
    pixel_glyph(p, kind, lx, 184, 5)
    smooth_glyph(p, kind, rx, 184, 56)
    p.text(lx-52, 246, 104, 20, label, 8, "$muted", align="center")
    p.text(rx-52, 246, 104, 20, label, 8, "$muted", align="center")
p.line(32, 302, 1216, 1, "0,0 100,0", "#41414199")
p.text(42, 330, 520, 22, "PIXEL MARKERS", 10, "$muted", spacing=1.2)
p.text(688, 330, 520, 22, "SMOOTH MARKERS", 10, "$muted", spacing=1.2)
pixel_glyph(p, "player", 190, 446, 9)
pixel_glyph(p, "enemy", 496, 446, 9)
player(p, 802, 446, 88)
enemy(p, 1108, 446, 88)
p.text(90, 526, 200, 24, "PLAYER", 12, "$white", True, align="center")
p.text(396, 526, 200, 24, "ENEMY", 12, "$white", True, align="center")
p.text(702, 526, 200, 24, "PLAYER", 12, "$white", True, align="center")
p.text(1008, 526, 200, 24, "ENEMY", 12, "$white", True, align="center")
p.line(32, 584, 1216, 1, "0,0 100,0", "#41414199")
p.text(32, 616, 180, 20, "GRAYSCALE", 9, "$muted", spacing=1.2)
for i, (name, col) in enumerate([("BLACK","#060606"),("DARK","#242424"),("MID","#666666"),("LIGHT","#AAAAAA"),("WHITE","#F5F5F5")]):
    x = 252+i*188
    p.rect(x, 616, 54, 14, fc=col, bc="#555555" if name == "BLACK" else None)
    p.text(x+66, 610, 100, 24, name, 8, "$muted")
p.save()

# PAGE 3 — pixelated, monochrome out-of-battle reward
p = Page("3_reward", pixel=True)
# Sparse bitmap texture, kept away from text.
for row in range(5):
    for col in range(14):
        if (row*3+col*5) % 4 == 0:
            p.rect(930+col*18, 82+row*14, 3, 3, fc="#FFFFFF14")
header(p, "03", "PROTOCOL AVAILABLE", "BATTLE 03 CLEARED", pixel=True)
p.text(32, 92, 700, 34, "CHOOSE ONE TO INSTALL", 22, "$white", font=PIXEL)
p.text(1100, 96, 148, 24, "HP 42/60", 16, "$muted", align="right", font=PIXEL)
options = [
    (52, "attack", "01 / ATTACK", "PIERCE", "Attack the first enemy\nin your row.", "REPLACES: ROW"),
    (464, "defense", "02 / DEFENSE", "SHELL", "Gain 2 Block for each\nDefense tile collected.", "NEW PROTOCOL"),
    (876, "star", "03 / STAR", "ECHO", "Every 3 Star tiles:\ndeal 2 damage to all enemies.", "TRIGGER: 0/3"),
]
for idx, (x, kind, kicker, title, desc, note) in enumerate(options):
    selected = idx == 0
    fg = "#080808" if selected else "$white"
    secondary = "#444444" if selected else "$muted"
    pixel_frame(p, x, 156, 352, 408, selected)
    p.text(x+24, 182, 304, 26, kicker, 17, fg, font=PIXEL)
    pixel_glyph(p, kind, x+58, 264, 6, fg)
    p.text(x+104, 238, 224, 48, title, 32, fg, font=PIXEL)
    p.text(x+24, 324, 304, 76, desc, 15, fg, wrap=True, valign="top",
           font=MONO, line_height=1.35)
    for xx in range(x+24, x+328, 14):
        p.rect(xx, 430, 7, 2, fc=secondary)
    p.text(x+24, 450, 304, 26, note, 16, secondary, font=PIXEL)
    if selected:
        p.rect(x+24, 504, 140, 32, fc="#080808")
        p.text(x+24, 504, 140, 32, "> SELECTED <", 16, "$white", align="center", font=PIXEL)
    else:
        p.text(x+24, 504, 304, 32, "> INSPECT", 16, "$muted", font=PIXEL)
for x in range(32, 1248, 16):
    p.rect(x, 614, 8, 2, fc="#555555")
p.text(32, 644, 400, 30, "<- -> INSPECT", 17, "$muted", font=PIXEL)
p.rect(1008, 636, 240, 46, fc="$white")
p.text(1008, 636, 240, 46, "SPACE INSTALL", 20, "#080808", align="center", font=PIXEL)
p.save()

main = {
    "version": "v2",
    "title": "Final Protocol — Monochrome Pixel / Smooth Review",
    "size": [1280, 720],
    "customFonts": [
        {"family": MONO, "src": "https://fonts.googleapis.com/css2?family=JetBrains+Mono"},
        {"family": SANS, "src": "https://statics.kimi.ai/neo-design-static/p-font/Liter.ttf"},
        {"family": PIXEL, "src": "https://statics.kimi.ai/neo-design-static/p-font/Jersey15.ttf"},
    ],
    "theme": {
        "colors": C,
        "textStyles": {
            "body": {"fontSize": 14, "fontFamily": MONO, "color": "$text"},
            "caption": {"fontSize": 10, "fontFamily": MONO, "color": "$muted"},
        },
    },
    "pages": ["pages/1_battle.page", "pages/2_components.page", "pages/3_reward.page"],
}
main_path = ROOT / "final-protocol-review.kanva.pptd"
main_path.write_text(json.dumps(main, indent=2), encoding="utf-8")

# Enforce the user's black/gray/white requirement on every literal color.
for path in [main_path, *PAGES.glob("*.page")]:
    for value in re.findall(r"#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?", path.read_text(encoding="utf-8")):
        r, g, b = int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)
        assert r == g == b, f"Non-monochrome color {value} in {path}"
print(main_path)
