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


def nav_html(current_slug):
    items = []
    for _pid, slug, en, zh in NAV:
        current = ' aria-current="page"' if slug == current_slug else ""
        items.append(
            f'<a href="{href_for(current_slug, slug)}"{current}>{pair(en, zh)}</a>'
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
                    "zh": item["name"]["zh"],
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


def render_block(block):
    editorial = " editorial" if block.get("editorial") else ""
    paras = []
    for para in block.get("paragraphs") or []:
        flag = ""
        if para.get("zh_status") == "provisional_translation":
            flag = (
                '<p class="flag">'
                + pair(
                    "Traditional Chinese in this paragraph is a provisional translation where the cited page is English.",
                    "若引用頁是英文，本段繁體中文是臨時翻譯。",
                )
                + "</p>"
            )
        paras.append(
            f'<p class="en">{esc(para["en"])}</p><p class="zh" lang="zh-Hant">{esc(para["zh"])}</p>{flag}'
        )
    label = ""
    if block.get("editorial"):
        label = (
            '<p class="flag">'
            + pair(
                "Editorial note. This is not an official instruction and adds no unpublished game facts.",
                "編輯說明。這不是官方指示，也不補充未公布的遊戲事實。",
            )
            + "</p>"
        )
    title = block["title"]
    return (
        f'<div class="block{editorial}"><h3>{pair(title["en"], title["zh"])}</h3>'
        f'{label}<div class="prose">{"".join(paras)}</div></div>'
    )


def render_item(current_slug, item):
    name_class = "caveat-name" if item.get("name_zh_status") == "official_tc_absent" else ""
    chips = []
    for chip in item.get("chips") or []:
        extra = "caveat-name" if chip.get("zh_status") == "official_tc_absent" else ""
        chips.append(f'<span class="chip">{pair(chip["en"], chip["zh"], extra)}</span>')
    desc_flag = ""
    if item.get("description_zh_status") == "provisional_translation":
        desc_flag = (
            '<p class="flag">'
            + pair(
                "Traditional Chinese description is a provisional translation.",
                "繁體中文簡介是臨時翻譯。",
            )
            + "</p>"
        )
    note = ""
    if item.get("note"):
        note = (
            f'<p class="notes en">{esc(item["note"]["en"])}</p>'
            f'<p class="notes zh" lang="zh-Hant">{esc(item["note"]["zh"])}</p>'
        )
    links = []
    for linked in item.get("links") or []:
        meta = LINKS.get(linked, {"en": linked, "zh": linked})
        links.append(
            f'<a href="{esc(person_href(current_slug, linked))}">{pair(meta["en"], meta["zh"])}</a>'
        )
    link_row = ""
    if links:
        link_row = (
            '<p class="notes">'
            + pair("Featured with", "對應介紹")
            + " "
            + " · ".join(links)
            + "</p>"
        )
    return f'''<article class="person" id="person-{esc(item["id"])}">
      <div class="person-body">
        <h3 class="person-name">{esc(item["name"]["en"])}</h3>
        <p class="card-name-zh {name_class}" lang="zh-Hant">{esc(item["name"]["zh"])}</p>
        <div class="chips">{"".join(chips)}</div>
        <p class="desc en">{esc(item["description"]["en"])}</p>
        <p class="desc zh" lang="zh-Hant">{esc(item["description"]["zh"])}</p>
        {desc_flag}
        {note}
        {link_row}
        <div class="cite"><ul>{source_items(item.get("sources") or [])}</ul></div>
      </div>
    </article>'''


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
    chunks = [
        '<div class="wrap" id="content">',
        '<header class="page-head">',
        '<p class="eyebrow">'
        + pair("Monster Hunter Outlanders", "魔物獵人：旅人")
        + "</p>",
        f'<h1>{pair(section["title"]["en"], section["title"]["zh"])}</h1>',
        f'<div class="lede">{pair(section["lede"]["en"], section["lede"]["zh"])}</div>',
        "</header>",
        f'<p class="notice">{pair(PACK["note"]["en"], PACK["note"]["zh"])}</p>',
    ]
    for block in section.get("blocks") or []:
        chunks.append(render_block(block))
    for group in section.get("groups") or []:
        chunks.append(f'<h3>{pair(group["title"]["en"], group["title"]["zh"])}</h3>')
        if group.get("intro"):
            chunks.append(f'<div class="lede">{pair(group["intro"]["en"], group["intro"]["zh"])}</div>')
        grid_class = "weapon-grid" if slug == "weapons" else "people"
        cards = "".join(render_item(slug, item) for item in group.get("items") or [])
        chunks.append(f'<div class="{grid_class}">{cards}</div>')
    chunks.append(
        '<div class="cite"><h3>'
        + pair("Section sources", "本節出處")
        + f'</h3><ul>{source_items(section.get("sources") or [])}</ul></div>'
    )
    chunks.append("</div>")
    return "\n".join(chunks)


def monsters_main():
    return '''<section class="hero">
      <div class="wrap hero-layout">
        <div>
          <p class="eyebrow"><span class="en">Monster Hunter Outlanders</span><span class="zh" lang="zh-Hant">魔物獵人：旅人</span></p>
          <h1><span class="en">Monsters</span><span class="zh" lang="zh-Hant">魔物</span></h1>
          <div class="lede">
            <span class="en">Officially named large monsters, with Elder Dragons kept apart. Other chapters — adventurers, weapons, Aesoland, and hunting — are separate pages.</span>
            <span class="zh" lang="zh-Hant">官方具名的大型魔物，古龍種分開列出。冒險家、武器、埃索島和狩獵是另外的頁面。</span>
          </div>
          <div class="pills">
            <span class="pill"><span class="en">23 officially named monsters</span><span class="zh" lang="zh-Hant">官方具名魔物 23 種</span></span>
            <span class="pill"><span class="en">10 Nov 2026 · Hong Kong time</span><span class="zh" lang="zh-Hant">2026年11月10日 · 香港時間</span></span>
            <span class="pill"><span class="en">Unofficial fan guide</span><span class="zh" lang="zh-Hant">非官方粉絲手冊</span></span>
          </div>
          <div class="notice" id="coverage"></div>
        </div>
        <figure class="hero-figure">
          <div class="frame-art">
            <img src="assets/web/ruger-key-art.jpg" width="1600" height="899" alt="Ruger Aidal key art, shown in full / 光稜龍主視覺，完整顯示" fetchpriority="high" decoding="async">
          </div>
        </figure>
      </div>
    </section>
    <div class="wrap">
      <div class="section-head" id="roster">
        <h2><span class="en">Elder Dragons</span><span class="zh" lang="zh-Hant">古龍種</span></h2>
        <p><span class="en">Only the three named as Elder Dragons in the sources reviewed.</span><span class="zh" lang="zh-Hant">只有本次查核來源中被稱為古龍種的三種。</span></p>
      </div>
      <div class="elder-grid" id="elder-grid"></div>
      <div class="section-head">
        <h2><span class="en">Officially named large monsters</span><span class="zh" lang="zh-Hant">官方具名的大型魔物</span></h2>
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
