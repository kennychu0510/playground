# Monster Hunter Outlanders Field Guide

Unofficial bilingual (English / Traditional Chinese) static fan guide to officially named large monsters in **Monster Hunter Outlanders**（《魔物獵人：旅人》).

This is **not** an official publication and is **not** affiliated with Capcom, TiMi Studio Group, Level Infinite, Proxima Beta, or Garena. It is an unofficial static fan page on Kenny’s playground.

**Live page:** https://kennychu0510.github.io/playground/outlanders-guide/

Researched **10 November 2026** (Hong Kong time, UTC+8).

## Open the guide

The guide is several static pages. Monsters stay at `outlanders-guide/`. Adventurers, weapons, Aesoland, and hunting each have their own folder. From the playground repository root:

```bash
python3 -m http.server 8080
```

Then open <http://127.0.0.1:8080/outlanders-guide/>. The other pages are `adventurers/`, `weapons/`, `aesoland/`, and `hunting/`.

To add a chapter, add an object to `data/sections.json` (its `id` becomes the folder name) and run `python3 scripts/build_site.py`.

`python3 scripts/build_site.py --standalone` writes `index.standalone.html` with artwork inlined. That file is gitignored and is not published.

## What’s in the first section

The opening section is the **monster roster** (the “dragons,” interpreted broadly). Only three species are classified as **Elder Dragons**: Ruger Aidal（光稜龍）, Kushala Daora（鋼龍）, and Nergigante（滅盡龍）. Everything else is filtered as Radiant（融光種）, standard（通常種）, or subspecies（亞種）.

The page shows English and Traditional Chinese together. There is no language switch.

Monster posters are the full 16:9 official images, fitted with `object-fit: contain` so heads, wings, and tails stay inside the frame.

Later sections cover the featured adventurers and buddies, the weapons named in official materials, what was published about Aesoland, and hunting, parties, and launch notes. Each section cites its sources and says when Traditional Chinese is only a provisional translation.

The guide lists **23** large monsters that were **officially named** on:

- the official Outlanders website and its Traditional Chinese locale file, or
- official `@MHO_English` Monster Info posts (individual reveals and Compilations ①–⑥)

reviewed on 10 November 2026.

**This is not a complete in-game count.** Community databases describe additional standard forms and Radiant variants that were not named in those official sources. They are omitted here rather than marked confirmed. No combat stats, weaknesses, or drop rates are included, because the official public materials reviewed for this guide do not publish them.

Confirmation labels:

- **Officially featured** — named on the official site and/or in a post-launch official Monster Info compilation, and/or in a current official event.
- **Officially scheduled** — Kushala Daora: official Monster Info plus the official Season 0 First Half calendar event “When Steelwing Descends” (13–26 November 2026). As of 10 November 2026 that event had not started. The calendar itself says timing may change.
- **Officially announced (pre-launch)** — Nergigante: official Monster Info (28 August 2026), official Garena “will appear” announcement, and an official closed-beta event. It is **not** in Compilations ①–⑥ and **not** on the official Season 0 First Half calendar, so post-launch hunt presence is not treated as verified here.

## Names

- Game title: official Traditional Chinese **魔物獵人：旅人** (official site / Garena zh-TW). English: Monster Hunter Outlanders.
- Original species **光稜龍** (Ruger Aidal) and the **融光種** prefix, plus names such as 火龍, 雌火龍, 櫻火龍, 融光種搔鳥, are taken from official Outlanders Traditional Chinese copy where available.
- Returning series names such as 賊龍, 吐毒龍, 痺賊龍, and 骨鎚龍 follow Capcom’s official *Monster Hunter: World* (Hong Kong) ecosystem pages, then take the official Outlanders prefix 融光種 where needed. These are marked in each entry.
- **黑角龍** (Black Diablos) is an established series Traditional Chinese name, but it was **not** found on the official Outlanders zh-tw locale or the Capcom HK World / Iceborne / Rise marketing pages checked on 10 November 2026. The entry flags that.
- Where official Traditional Chinese *body text* was not available, the English text is official and the Chinese is a **provisional translation**, clearly labelled in the detail panel.

## How to extend later sections

Keep `data/monsters.json` and `data/sources.json` as the source of truth (schema `mho-field-guide.monsters.v1`). To add a later guide section (adventurers, weapons, map), add a sibling JSON file under `data/` and a new page or section; the current nav already leaves placeholders.

After editing data or `src/guide.css` / `src/guide.js` / `src/template.html`:

```bash
python3 scripts/build_data.py   # if you changed the Python data builder
python3 scripts/build_site.py   # rebuilds index.html and index.linked.html
python3 tests/test_guide.py
```

## Folder

| Path | Purpose |
| --- | --- |
| `index.html` | Monster roster. This is the guide home |
| `adventurers/` | Featured adventurers and buddies |
| `weapons/` | Weapons named in official materials |
| `aesoland/` | Island and exploration, limited to published facts |
| `hunting/` | Parties, crafting notes, and launch details |
| `guide.css`, `monsters.js` | Shared style, and the roster script. Other pages do not load `monsters.js` |
| `assets/web/` | Optimized official artwork packaged locally |
| `data/monsters.json` | Monster records, citations, name/description status |
| `data/sources.json` | Primary source catalogue |
| `src/` | CSS, JS, and HTML template |
| `scripts/` | Rebuild helpers |
| `tests/test_guide.py` | Static data and HTML checks |

Official artwork is © CAPCOM / © 2026 Proxima Beta Pte. Ltd., packaged only for this unofficial fan guide.
