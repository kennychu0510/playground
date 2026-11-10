#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble the field guide pages.

GitHub Pages serves index.html. That file, and index.linked.html, use
linked files under assets/web/ so the published HTML stays small.
Pass --standalone to also write index.standalone.html (images inlined).
That archive is gitignored and is not part of the published site.
"""
import json, base64, mimetypes, sys
from pathlib import Path

ROOT = Path("/workspace/outlanders-guide")
SRC = ROOT / "src"
DATA = json.loads((ROOT / "data/monsters.json").read_text(encoding="utf-8"))
SECTIONS = json.loads((ROOT / "data/sections.json").read_text(encoding="utf-8"))
SOURCES = json.loads((ROOT / "data/sources.json").read_text(encoding="utf-8"))["sources"]
CSS = (SRC / "guide.css").read_text(encoding="utf-8")
JS = (SRC / "guide.js").read_text(encoding="utf-8")
TPL = (SRC / "template.html").read_text(encoding="utf-8")

def data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif path.suffix.lower() == ".png":
        mime = "image/png"
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"

def assemble(guide, logo_url, hero_url):
    html = TPL
    html = html.replace("/*__CSS__*/", CSS)
    html = html.replace("/*__JS__*/", JS)
    html = html.replace("__HERO__", hero_url)
    html = html.replace("__LOGO__", logo_url)
    html = html.replace("__GUIDE_DATA__", json.dumps(guide, ensure_ascii=False, separators=(",", ":")))
    html = html.replace("__SECTIONS__", json.dumps(SECTIONS, ensure_ascii=False, separators=(",", ":")))
    html = html.replace("__SOURCES__", json.dumps(SOURCES, ensure_ascii=False, separators=(",", ":")))
    return html

linked = assemble(DATA, "assets/web/logo.png", "assets/web/ruger-key-art.jpg")
(ROOT / "index.html").write_text(linked, encoding="utf-8")
(ROOT / "index.linked.html").write_text(linked, encoding="utf-8")
print("wrote index.html", len(linked))
print("wrote index.linked.html", len(linked))

if "--standalone" in sys.argv:
    standalone_data = json.loads(json.dumps(DATA))
    used = set()
    for m in standalone_data["monsters"]:
        for key in ("hero", "card"):
            rel = Path(m["images"][key])
            path = ROOT / rel
            if not path.exists():
                raise SystemExit(f"missing image {path}")
            m["images"][key] = data_url(path)
            used.add(path)
    logo = data_url(ROOT / "assets/web/logo.png")
    hero = data_url(ROOT / "assets/web/ruger-key-art.jpg")
    html = assemble(standalone_data, logo, hero)
    out = ROOT / "index.standalone.html"
    out.write_text(html, encoding="utf-8")
    print("wrote", out.name, f"{out.stat().st_size/1024/1024:.2f} MB", "embedded images", len(used))
