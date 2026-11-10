#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build separate static guide pages for GitHub Pages.

Each entry in data/sections.json becomes its own folder. The monster
roster stays at index.html. Shared CSS is guide.css. Monster search
script is monsters.js and is not loaded by the other pages.
"""
import html
import json
import shutil
from pathlib import Path

ROOT = Path("/workspace/outlanders-guide")
SRC = ROOT / "src"
DATA = json.loads((ROOT / "data/monsters.json").read_text(encoding="utf-8"))
PACK = json.loads((ROOT / "data/sections.json").read_text(encoding="utf-8"))
SOURCES = json.loads((ROOT / "data/sources.json").read_text(encoding="utf-8"))["sources"]
SOURCE_BY_ID = {s["id"]: s for s in SOURCES}
PAGE = (SRC / "page.html").read_text(encoding="utf-8")

NAV = [("monsters", "", "Monsters", "魔物")] + [
    (s["id"], s["id"], s["nav"]["en"], s["nav"]["zh"]) for s in PACK["sections"]
]


def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def pair(en, zh, extra_zh=""):
    zh_class = "zh " + extra_zh if extra_zh else "zh"
    return (
        f'<span class="pair"><span class="en">{esc(en)}</span>'
        f'<span class="{zh_class}" lang="zh-Hant">{esc(zh)}</span></span>'
    )


def source_items(ids):
    parts = []
    for sid in ids:
        src = SOURCE_BY_ID.get(sid)
        if not src:
            parts.append(f"<li>{esc(sid)}</li>")
            continue
        title = src.get("title") or {}
        date = f" ({esc(src['date'])})" if src.get("date") else ""
        parts.append(
            f'<li><a href="{esc(src["url"])}" target="_blank" rel="noopener noreferrer">'
            f'{pair(title.get("en") or src["url"], title.get("zh") or title.get("en") or src["url"])}</a>{date}</li>'
        )
    return "".join(parts)


def href_for(current_slug, target_slug):
    if current_slug == "":
        return "./" if target_slug == "" else f"{target_slug}/"
    if target_slug == "":
        return "../"
    if target_slug == current_slug:
        return "./"
    return f"../{target_slug}/"


def asset_prefix(current_slug):
    return "" if current_slug == "" else "../"


def hub_href(current_slug):
    return "../" if current_slug == "" else "../../"


def icon(name, prefix):
    return f'<svg class="ico" aria-hidden="true"><use href="{prefix}icons.svg#{esc(name)}"></use></svg>'


def nav_html(current_slug):
    prefix = asset_prefix(current_slug)
    items = []
    for _pid, slug, en, zh in NAV:
        current = ' aria-current="page"' if slug == current_slug else ""
        items.append(
            f'<a href="{href_for(current_slug, slug)}"{current}>{icon(slug or "monsters", prefix)}{pair(en, zh)}</a>'
        )
    return "\n        ".join(items)


def directory():
    found = {}
    for section in PACK["sections"]:
        for group in section.get("groups") or []:
            for item in group.get("items") or []:
                found[item["id"]] = {
                    "slug": section["id"],
                    "en": item["name"]["en"],
                    "zh": "" if item.get("name_zh_status") == "official_tc_absent" else item["name"]["zh"],
                }
    return found


LINKS = directory()


def person_href(current_slug, item_id):
    target = LINKS.get(item_id)
    if not target:
        return "#person-" + item_id
    if target["slug"] == current_slug:
        return "#person-" + item_id
    return href_for(current_slug, target["slug"]) + "#person-" + item_id


BRIEF = {
    "midori": ("Spirit Gauge fills faster.", "練氣計量表累積更快。"),
    "rhodes": ("Charged hits store energy for an explosion.", "蓄力取得能量，再打出爆炸。"),
    "haze": ("Fast slashes. Archdemon Mode can parry.", "高速連斬。Archdemon Mode 可招架。"),
    "ryunosuke": ("Eat in a stance to power Spirit Blade.", "特定姿勢進食，強化 Spirit Blade。"),
    "luxheart": ("Heat switches stances, then a firework burst.", "以 Heat 切換姿勢，再放出煙火般的一擊。"),
    "pyro": ("Take hits, then one heavy burst.", "承受攻擊，換一次爆發重擊。"),
    "keres": ("Rapid slashes into stronger follow-ups.", "高速連斬，可接更強的追擊。"),
    "luka": ("Mobile bow. Thunder Coating arrows pierce.", "高機動的弓。電流瓶的箭可貫通。"),
    "arkaya": ("Attacks build Resolve for one shielded hit.", "攻擊累積鬥志，打出一次帶防護的重擊。"),
    "raya": ("Dodge, and spend stamina to fill the Demon Gauge.", "閃避，並消耗耐力累積鬼人計量表。"),
    "ouyang-varen": ("Shield guard. Impetus powers thrusts.", "盾牌招架。鋒銳層數強化突刺。"),
    "madelyn": ("Bow and spores that burst and buff allies.", "弓與孢子。引爆後強化自己和附近隊友。"),
    "pepper": ("Heavy bowgun. Some shots fire from the air.", "重弩槍。部分射擊在空中連發。"),
    "rutaco": ("Builds with tools and Radiantite.", "用工具和融石建造。"),
    "trillan": ("Supports with song.", "以歌聲支援。"),
    "palico": ("Uses weapons and items.", "使用武器和道具。"),
    "long-sword": ("Spirit Gauge and Spirit Blade.", "練氣計量表與 Spirit Blade。"),
    "hammer": ("Charge, store energy, then explode.", "蓄力、存能量、再爆炸。"),
    "dual-blades": ("Fast slashes and a Demon Gauge.", "高速連斬與鬼人計量表。"),
    "great-sword": ("A heavy burst, or Heat stances.", "爆發重擊，或以 Heat 切換姿勢。"),
    "bow": ("Thunder Coating, or spores that buff allies.", "電流瓶，或能強化隊友的孢子。"),
    "lance": ("Resolve or a guarding shield.", "鬥志，或用盾招架。"),
    "heavy-bowgun": ("Powerful shots, some from midair.", "強力射擊，部分在空中連發。"),
    "charge-blade": ("Named in the store list. No moves listed.", "商店有列名。未列招式。"),
}

CHIP_ICON = {
    "Assault": "assault", "Support": "support", "Disruptor": "disruptor",
    "Long Sword": "long-sword", "Hammer": "hammer", "Dual Blades": "dual-blades",
    "Great Sword": "great-sword", "Bow": "bow", "Lance": "lance",
    "Heavy Bowgun": "heavy-bowgun", "Charge Blade": "charge-blade",
    "Buddy": "adventurers",
}


def shown_pair(en, zh, status):
    if status == "official_tc_absent":
        return f'<span class="en">{esc(en)}</span>'
    return pair(en, zh)


def render_item(current_slug, item):
    prefix = asset_prefix(current_slug)
    brief = BRIEF.get(item["id"])
    line = pair(brief[0], brief[1]) if brief else pair(item["description"]["en"], item["description"]["zh"])
    chips = []
    for chip in item.get("chips") or []:
        glyph = icon(CHIP_ICON.get(chip["en"], "weapons"), prefix)
        label = shown_pair(chip["en"], chip["zh"], chip.get("zh_status"))
        chips.append(f'<span class="chip with-icon">{glyph}{label}</span>')
    links = []
    for linked in item.get("links") or []:
        meta = LINKS.get(linked, {"en": linked, "zh": ""})
        label = pair(meta["en"], meta["zh"]) if meta.get("zh") else f'<span class="en">{esc(meta["en"])}</span>'
        links.append(f'<a class="chip" href="{esc(person_href(current_slug, linked))}">{label}</a>')
    link_row = f'<div class="chips">{"".join(links)}</div>' if links else ""
    name_zh = ""
    if item.get("name_zh_status") != "official_tc_absent":
        name_zh = f'<p class="card-name-zh" lang="zh-Hant">{esc(item["name"]["zh"])}</p>'
    return f'''<article class="person" id="person-{esc(item["id"])}">
      <div class="person-body">
        <h3 class="person-name">{esc(item["name"]["en"])}</h3>
        {name_zh}
        <div class="chips">{"".join(chips)}</div>
        <p class="desc">{line}</p>
        {link_row}
      </div>
    </article>'''


def fact_list(prefix, rows):
    items = []
    for glyph, en, zh in rows:
        items.append(f"<li>{icon(glyph, prefix)}{pair(en, zh)}</li>")
    return '<ul class="facts">' + "".join(items) + "</ul>"


def cited_ids(section):
    ordered = []
    seen = set()
    for sid in section.get("sources") or []:
        if sid not in seen:
            ordered.append(sid)
            seen.add(sid)
    for group in section.get("groups") or []:
        for item in group.get("items") or []:
            for sid in item.get("sources") or []:
                if sid not in seen:
                    ordered.append(sid)
                    seen.add(sid)
    return ordered


def render_section_main(section):
    slug = section["id"]
    prefix = asset_prefix(slug)
    short_title = {
        "weapons": ("Weapons", "武器"),
        "hunting": ("Hunting", "狩獵"),
        "aesoland": ("Aesoland", "埃索島"),
        "adventurers": ("Adventurers", "冒險家"),
    }.get(slug, (section["title"]["en"], section["title"]["zh"]))
    chunks = [
        '<div class="wrap" id="content">',
        '<header class="page-head">',
        f'<h1>{pair(short_title[0], short_title[1])}</h1>',
        "</header>",
    ]
    if slug == "aesoland":
        chunks.append(fact_list(prefix, [
            ("aesoland", "Aesoland", "埃索島"),
            ("build", "Regions change with terrain and weather. Names are not listed.", "區域隨地形與天氣變化。名稱未公開。"),
            ("build", "Launchers, ziplines, and gliding.", "發射器、滑索、滑翔。"),
            ("craft", "Gather materials, then watch how monsters hunt.", "採集素材，並觀察魔物如何狩獵。"),
        ]))
    elif slug == "hunting":
        chunks.append(fact_list(prefix, [
            ("party", "Up to four hunters.", "最多四名獵人。"),
            ("hunting", "Co-op skills.", "共鬥技。"),
            ("party", "Team up on the same server.", "同一伺服器才能組隊。"),
            ("calendar", "29 Oct 2026, 06:00 UTC+8.", "2026年10月29日 06:00（UTC+8）。"),
            ("weapons", "iOS and Android. One-button combos.", "iOS 與 Android。可一鍵出連段。"),
            ("craft", "Gather materials and craft gear.", "採集素材並打造裝備。"),
            ("support", "In-game language includes Traditional Chinese.", "遊戲內可選繁體中文。"),
            ("calendar", "Daily refresh 05:00 server time.", "每日 05:00（伺服器時間）刷新。"),
            ("adventurers", "Each adventurer uses one weapon.", "每位冒險家使用一種武器。"),
        ]))
    else:
        for group in section.get("groups") or []:
            if group["id"] == "buddies":
                chunks.append(f'<h2>{pair("Buddies", "隨從")}</h2>')
            grid_class = "weapon-grid" if slug == "weapons" else "people"
            cards = "".join(render_item(slug, item) for item in group.get("items") or [])
            chunks.append(f'<div class="{grid_class}">{cards}</div>')
    chunks.append("</div>")
    return "\n".join(chunks)


def monsters_main():
    return '''<section class="hero">
      <div class="wrap hero-layout">
        <figure class="hero-figure">
          <div class="frame-art">
            <img src="assets/web/ruger-key-art.jpg" width="1600" height="899" alt="Ruger Aidal key art, shown in full / 光稜龍主視覺，完整顯示" fetchpriority="high" decoding="async">
          </div>
        </figure>
        <div>
          <h1><span class="en">Monsters</span><span class="zh" lang="zh-Hant">魔物</span></h1>
        </div>
      </div>
    </section>
    <div class="wrap">
      <div class="section-head" id="roster">
        <h2><span class="en">Elder Dragons</span><span class="zh" lang="zh-Hant">古龍種</span></h2>
      </div>
      <div class="elder-grid" id="elder-grid"></div>
      <div class="section-head">
        <h2><span class="en">Roster</span><span class="zh" lang="zh-Hant">名冊</span></h2>
        <p id="count" class="count"></p>
      </div>
      <div class="toolbar">
        <div class="search">
          <label class="search-label" for="search"><span class="en">Search</span><span class="zh" lang="zh-Hant">搜尋</span></label>
          <div class="search-field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
            <input id="search" type="search" autocomplete="off" spellcheck="false" placeholder="Rathalos / 火龍">
          </div>
        </div>
        <div class="filters" id="filters" role="toolbar" aria-label="Monster category / 魔物分類"></div>
      </div>
      <div class="grid" id="grid"></div>
      <p class="empty" id="empty"></p>
    </div>
    <div class="modal-root" id="modal" hidden>
      <div class="backdrop" id="backdrop"></div>
      <div class="dialog" id="dialog" role="dialog" aria-modal="true"></div>
    </div>'''


def assemble(current_slug, title, description, main, foot_ids, scripts, skip, skip_text):
    html_out = PAGE
    html_out = html_out.replace("__ASSET__", asset_prefix(current_slug))
    html_out = html_out.replace("__HUB__", hub_href(current_slug))
    html_out = html_out.replace("__MONSTERS_HREF__", href_for(current_slug, ""))
    html_out = html_out.replace("__TITLE__", esc(title))
    html_out = html_out.replace("__DESCRIPTION__", esc(description))
    html_out = html_out.replace("__NAV__", nav_html(current_slug))
    html_out = html_out.replace("__SKIP__", skip)
    html_out = html_out.replace("__SKIP_TEXT__", skip_text)
    html_out = html_out.replace("__MAIN__", main)
    html_out = html_out.replace("__FOOT_SOURCES__", source_items(foot_ids))
    html_out = html_out.replace("__SCRIPTS__", scripts)
    return html_out


def write_page(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("wrote", path.relative_to(ROOT), len(text))


shutil.copyfile(SRC / "guide.css", ROOT / "guide.css")
shutil.copyfile(SRC / "guide.js", ROOT / "monsters.js")
shutil.copyfile(SRC / "icons.svg", ROOT / "icons.svg")

monster_scripts = (
    '<script type="application/json" id="guide-data">'
    + json.dumps(DATA, ensure_ascii=False, separators=(",", ":"))
    + "</script>\n  <script>window.GUIDE_SOURCES = "
    + json.dumps(SOURCES, ensure_ascii=False, separators=(",", ":"))
    + ';</script>\n  <script src="monsters.js"></script>'
)
write_page(
    ROOT / "index.html",
    assemble(
        "",
        "Monsters / 魔物 — Outlanders Field Guide",
        "Unofficial English and Traditional Chinese monster roster for Monster Hunter Outlanders.",
        monsters_main(),
        [s["id"] for s in SOURCES],
        monster_scripts,
        "#roster",
        "Skip to monsters / 跳至魔物",
    ),
)

for section in PACK["sections"]:
    slug = section["id"]
    write_page(
        ROOT / slug / "index.html",
        assemble(
            slug,
            f'{section["title"]["en"]} / {section["title"]["zh"]} — Outlanders Field Guide',
            section["lede"]["en"],
            render_section_main(section),
            cited_ids(section),
            "",
            "#content",
            "Skip to content / 跳至內文",
        ),
    )

redirect = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="./">
  <meta http-equiv="refresh" content="0; url=./">
  <title>Monsters / 魔物</title>
</head>
<body>
  <p><a href="./">Monsters / 魔物</a></p>
</body>
</html>
"""
write_page(ROOT / "index.linked.html", redirect)
