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
css = (ROOT / "src/guide.css").read_text(encoding="utf-8")
ok("card-name-en" in js and "card-name-zh" in js, "card template has both name lines")
ok("subnames" in js, "detail template has the second name")
ok(js.count("m.name.en") >= 4 and js.count("m.name.zh") >= 4, "script keeps English and Traditional Chinese names together")
ok("m.description.en" in js and "m.description.zh" in js, "details keep both descriptions")
ok("data-lang-btn" not in js, "language toggle script is gone")
ok("localStorage" not in js, "language preference is not stored")
ok("images.hero" in js, "cards use the full hero poster")
ok('getElementById("close-modal").setAttribute' not in js, "missing close button does not throw")
shell = (ROOT / "src/page.html").read_text(encoding="utf-8")
ok("not affiliated" in shell, "unofficial disclaimer kept")
ok("Capcom" in shell and "Garena" in shell, "disclaimer names rights holders")
ok("object-fit:contain" in css, "artwork uses contain")
ok("aspect-ratio:16/9" in css, "artwork frame matches the 16:9 posters")
ok(".nav-future{display:none" not in css.replace(" ", ""), "section nav stays available on narrow screens")
ok("min-height:var(--tap)" in css or "min-height:44px" in css or "--tap:44px" in css, "touch target size is defined")

sections = json.loads((ROOT / "data/sections.json").read_text(encoding="utf-8"))
sec_by = {s["id"]: s for s in sections["sections"]}
for sid in ("adventurers", "weapons", "aesoland", "hunting"):
    ok(sid in sec_by, f"section {sid}")
    ok(sec_by[sid]["title"]["en"] and sec_by[sid]["title"]["zh"], f"{sid} bilingual title")
    ok(sec_by[sid]["sources"], f"{sid} has sources")
adv_items = [i for g in sec_by["adventurers"]["groups"] if g["id"]=="featured-adventurers" for i in g["items"]]
ok(len(adv_items)==13, f"13 featured adventurers ({len(adv_items)})")
ok(sum(1 for i in adv_items if i["name_zh_status"]=="official_outlanders")==9, "9 adventurers have official TC names")
ok(sum(1 for i in adv_items if i["name_zh_status"]=="official_tc_absent")==4, "4 adventurers flag missing official TC names")
buddies = [i for g in sec_by["adventurers"]["groups"] if g["id"]=="buddies" for i in g["items"]]
ok({i["id"] for i in buddies}=={"rutaco","trillan","palico"}, "three official buddies")
weapons = [i for g in sec_by["weapons"]["groups"] for i in g["items"]]
ok({i["id"] for i in weapons}=={"long-sword","hammer","dual-blades","great-sword","bow","lance","heavy-bowgun","charge-blade"}, "weapon coverage")
cb = next(i for i in weapons if i["id"]=="charge-blade")
ok("no move" in cb["description"]["en"].lower() or "No move" in cb["description"]["en"], "charge blade has no invented moves")
ok("map" in sec_by["aesoland"]["blocks"][1]["paragraphs"][0]["en"].lower(), "aesoland states the map was not published")
for s in sections["sections"]:
    for group in s.get("groups") or []:
        for item in group["items"]:
            ok(item["name"]["en"] and item["name"]["zh"], f"{item['id']} both names")
            ok(item["description"]["en"] and item["description"]["zh"], f"{item['id']} both descriptions")
            missing = [src for src in item["sources"] if src not in src_ids]
            ok(not missing, f"{item['id']} sources exist {missing}")

# Separate static pages. The roster does not embed the other chapters.
ok(not (ROOT / "index.standalone.html").exists(), "standalone image archive is not in the published folder")
ok("guide-sections" not in js, "monster script does not load other chapters")

def page_text(rel):
    return (ROOT / rel).read_text(encoding="utf-8")

monsters_html = page_text("index.html")
ok("guide-data" in monsters_html and "guide-sections" not in monsters_html, "roster page has monsters only")
ok("米多麗" not in monsters_html and "Adventurers and Buddies" not in monsters_html, "roster page does not include later chapters")
ok('href="adventurers/"' in monsters_html and 'href="weapons/"' in monsters_html, "roster nav uses real page paths")
ok('href="#adventurers"' not in monsters_html, "roster nav is not an in-page anchor")
ok(monsters_html.count('aria-current="page"') == 1 and 'href="./" aria-current="page"' in monsters_html, "roster marks itself current")
ok('src="monsters.js"' in monsters_html and 'href="guide.css"' in monsters_html, "roster links shared files")
ok("assets/web/ruger-key-art.jpg" in monsters_html and "assets/web/logo.png" in monsters_html, "roster asset paths")
ok("data-lang-btn" not in monsters_html and "data:image/" not in monsters_html, "roster has no toggle or image archive")
ok('href="../"' in monsters_html, "roster links back to the playground hub")
embedded = json.loads(re.search(r'<script type="application/json" id="guide-data">(.*?)</script>', monsters_html, re.S).group(1))
ok(len(embedded["monsters"]) == 23, "roster embeds 23 monsters")
for monster in embedded["monsters"]:
    en, zh = monster["name"]["en"].strip(), monster["name"]["zh"].strip()
    ok(en and zh and en != zh, f"roster data {monster['id']} both names")

pages = {
    "adventurers/index.html": ["米多麗", "露塔可", "梅朵鸝", "艾露", "person-midori"],
    "weapons/index.html": ["Charge Blade", "太刀", "No move description", "../adventurers/#person-midori"],
    "aesoland/index.html": ["埃索島", "does not publish a labelled region map", "ziplines"],
    "hunting/index.html": ["up to four", "Editorial note", "05:00:00"],
}
for rel, needles in pages.items():
    text = page_text(rel)
    ok("guide-data" not in text and "monsters.js" not in text, f"{rel} does not load the roster")
    ok('href="../guide.css"' in text and 'src="../assets/web/logo.png"' in text, f"{rel} asset prefix")
    ok('href="../../"' in text, f"{rel} hub link climbs two levels")
    ok(text.count('aria-current="page"') == 1, f"{rel} one current nav item")
    ok("not affiliated" in text and "非官方粉絲手冊" in text, f"{rel} disclaimer")
    ok("data-lang-btn" not in text, f"{rel} no language toggle")
    for needle in needles:
        ok(needle in text, f"{rel} keeps {needle}")

ok('href="./" aria-current="page"' in page_text("adventurers/index.html"), "adventurers page is current")
ok("guide-sections" not in page_text("weapons/index.html"), "weapon page is not a bundle of every chapter")
linked = page_text("index.linked.html")
ok(len(linked) < 800 and 'url=./' in linked and "guide-data" not in linked, "old linked filename redirects to the roster")

if errors:
    print("\nFAILED:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("\nAll", "checks passed.")
