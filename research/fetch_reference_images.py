import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

OUT = Path(__file__).resolve().parent / "references"
OUT.mkdir(parents=True, exist_ok=True)
APPS = {
    "duskers": 254320,
    "cogmind": 722730,
    "into_the_breach": 590380,
    "hacknet": 365450,
}
metadata = []
for name, app_id in APPS.items():
    api = f"https://store.steampowered.com/api/appdetails?appids={app_id}"
    req = Request(api, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as response:
        payload = json.load(response)
    data = payload[str(app_id)]["data"]
    shots = data.get("screenshots", [])
    if not shots:
        continue
    shot = shots[0]
    image_url = shot["path_full"]
    ext = Path(urlsplit(image_url).path).suffix or ".jpg"
    filename = f"{name}{ext}"
    req = Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=30) as response:
        (OUT / filename).write_bytes(response.read())
    metadata.append({
        "game": data["name"],
        "app_id": app_id,
        "store_page": f"https://store.steampowered.com/app/{app_id}/",
        "image_url": image_url,
        "local_file": filename,
    })
    print(f"Downloaded {data['name']}: {filename}")
(OUT / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
