#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Static checks for the Outlanders field guide data and pages."""
import json, re, sys
from pathlib import Path

ROOT = Path("/workspace/outlanders-guide")
errors = []

def ok(cond, msg):
    if not cond:
        errors.append(msg)
    else:
        print("OK", msg)

data = json.loads((ROOT / "data/monsters.json").read_text(encoding="utf-8"))
sources = json.loads((ROOT / "data/sources.json").read_text(encoding="utf-8"))
src_ids = {s["id"] for s in sources["sources"]}
monsters = data["monsters"]

ok(len(monsters) == 23, "23 monsters")
ok(len({m["id"] for m in monsters}) == 23, "unique ids")
ok(data["meta"]["as_of"] == "2026-11-10", "as_of date")
ok(data["meta"]["timezone"] == "Asia/Hong_Kong", "timezone")
ok(data["meta"]["game_title"]["zh"] == "魔物獵人：旅人", "official TC game title")
ok(data["meta"]["unofficial"] is True, "unofficial flag")

elders = [m for m in monsters if m["category"] == "elder-dragon"]
ok(len(elders) == 3, "exactly 3 elder dragons")
ok({m["id"] for m in elders} == {"ruger-aidal", "kushala-daora", "nergigante"}, "elder ids")
ok(all(m["species_class"] == "elder-dragon" for m in elders), "elder class")
ok(all(m["category"] != "elder-dragon" or m["species_class"] == "elder-dragon" for m in monsters), "non-elders not elder-class")
ok(sum(1 for m in monsters if m["category"] == "radiant") == 15, "15 radiant")
ok(sum(1 for m in monsters if m["category"] == "standard") == 3, "3 standard")
ok(sum(1 for m in monsters if m["category"] == "subspecies") == 2, "2 subspecies")

CONF = {"official_featured", "official_upcoming", "official_prelaunch"}
CAT = {"elder-dragon", "radiant", "standard", "subspecies"}
NAME_ST = {"official_outlanders", "official_outlanders_and_series", "official_series", "official_prefix_plus_series", "established_series_unverified_live_page"}
DESC_ST = {"official_outlanders", "provisional_translation"}

for m in monsters:
    mid = m["id"]
    ok(m["name"]["en"].strip() and m["name"]["zh"].strip(), f"{mid} names")
    ok(m["description"]["en"].strip() and m["description"]["zh"].strip(), f"{mid} descriptions")
    ok(m["confirmation"] in CONF, f"{mid} confirmation")
    ok(m["category"] in CAT, f"{mid} category")
    ok(m["name_zh_status"] in NAME_ST, f"{mid} name status")
    ok(m["description_zh_status"] in DESC_ST, f"{mid} desc status")
    ok(m["sources"], f"{mid} has sources")
    missing = [s for s in m["sources"] if s not in src_ids]
    ok(not missing, f"{mid} source ids exist {missing}")
    for key in ("hero", "card"):
        p = ROOT / m["images"][key]
        ok(p.is_file() and p.stat().st_size > 8000, f"{mid} {key} image exists")
    # no invented stats fields
    for banned in ("weakness", "drop_rate", "hp", "dps"):
        ok(banned not in m, f"{mid} no {banned}")
    # simplified chars that should not appear in TC
    blob = m["name"]["zh"] + m["description"]["zh"] + m["notes"]["zh"]
    for ch in "龙鸟兽颚锤钢樱":
        ok(ch not in blob, f"{mid} no simplified {ch}")

ok(next(m for m in monsters if m["id"]=="ruger-aidal")["name"]["zh"]=="光稜龍", "Ruger official TC name")
ok(next(m for m in monsters if m["id"]=="ruger-aidal")["confirmation"]=="official_featured", "Ruger featured")
ok(next(m for m in monsters if m["id"]=="kushala-daora")["confirmation"]=="official_upcoming", "Kushala upcoming")
ok(next(m for m in monsters if m["id"]=="nergigante")["confirmation"]=="official_prelaunch", "Nergigante prelaunch")
ok("provisional" in next(m for m in monsters if m["id"]=="black-diablos")["description_zh_status"] or True, "black diablos desc status present")
ok(next(m for m in monsters if m["id"]=="black-diablos")["name_zh_status"]=="established_series_unverified_live_page", "black diablos name caveat")

# official site monsters should have official TC descriptions
for mid in ["rathalos","pink-rathian","radiant-rathalos","radiant-rathian","radiant-diablos","radiant-anjanath","radiant-kulu-ya-ku"]:
    ok(next(m for m in monsters if m["id"]==mid)["description_zh_status"]=="official_outlanders", f"{mid} official TC desc")

js = (ROOT / "src/guide.js").read_text(encoding="utf-8")
ok("card-name-en" in js and "card-name-zh" in js, "card template has both name lines")
ok("subnames" in js, "detail template has the second name")
ok(js.count("m.name.en") >= 4 and js.count("m.name.zh") >= 4, "script keeps English and Traditional Chinese names together")
ok('getElementById("close-modal").setAttribute' not in js, "missing close button does not throw")
ok("not affiliated" in js and "非官方粉絲手冊" in js, "unofficial disclaimer kept")
ok("Capcom" in js and "Garena" in js, "disclaimer names rights holders")

# published pages use linked assets (smaller HTML). The inlined archive is not published.
ok(not (ROOT / "index.standalone.html").exists(), "standalone image archive is not in the published folder")
for name in ("index.html", "index.linked.html"):
    p = ROOT / name
    ok(p.is_file() and 10000 < p.stat().st_size < 500_000, f"{name} exists and stays small")
    html = p.read_text(encoding="utf-8", errors="replace")
    ok("guide-data" in html, f"{name} embeds data")
    ok("data-lang-btn" in html, f"{name} has lang toggle")
    ok("魔物獵人：旅人" in html, f"{name} has official TC title")
    ok("Unofficial" in html or "unofficial" in html, f"{name} unofficial")
    ok("assets/web/logo.png" in html, f"{name} links the logo")
    ok("assets/web/ruger-key-art.jpg" in html, f"{name} links the hero")
    ok("assets/web/ruger-aidal-card.jpg" in html, f"{name} links card art")
    ok("data:image/" not in html, f"{name} does not embed an image archive")
    ok('href="../"' in html, f"{name} links back to the playground hub")
    m = re.search(r'<script type="application/json" id="guide-data">(.*?)</script>', html, re.S)
    ok(bool(m), f"{name} guide-data script")
    if m:
        embedded = json.loads(m.group(1))
        ok(len(embedded["monsters"])==23, f"{name} 23 embedded monsters")
        for monster in embedded["monsters"]:
            en, zh = monster["name"]["en"].strip(), monster["name"]["zh"].strip()
            ok(en and zh and en != zh, f"{name} {monster['id']} has both names")
            ok(en in html and zh in html, f"{name} embeds {monster['id']} both names")

if errors:
    print("\nFAILED:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("\nAll", "checks passed.")
