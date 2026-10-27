# LF2 Lite

Fan-inspired **Little Fighter 2**–style web beat-em-up for Kenny’s playground.

## Disclaimer

This is an **original** demo. It is **not** Little Fighter 2 and does **not** include or redistribute LF2’s `.bmp` / `.dat` / installer assets (copyright Marti Wong & Starsky Wong). Character art here is simple original pixel sheets generated for this project, loosely inspired by classic LF2 roles (melee / swordsman / energy mage).

## Play

- Open from the playground hub: `sims/lf2-lite/`
- Or locally: `npm install && npm run dev` in this folder

## Characters

| Id | Name | Role | Special (single button) |
| --- | --- | --- | --- |
| `blaze` | Blaze | Melee fighter | Energy fist dash + short blast |
| `edge` | Edge | Swordsman | Wide sword slash |
| `prism` | Prism | Energy mage | Ranged energy bolt |

Each has **HP** (red) and **MP** (blue). MP regenerates slowly; specials spend MP.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → / A D | on-screen ◀ ▶ |
| Jump | Space / W / ↑ | ⬆ |
| Attack | Z / J | A |
| **Special** | **X / K** | **SP** |

No D+direction combos — special is one button.

## Stage

One dojo-yard stage with **3 AI enemies**. Win when all are down; lose when your HP hits 0. Restart from the end screen.

## Assets

Original sheets live in `public/assets/characters/`:

- `blaze.png`, `edge.png`, `prism.png` — sprite strips
- `roster.json` — frame layout + stats

Regenerate with `npm run gen:sprites` (Node, no LF2 files).

## Build

```bash
npm install
npm run build   # → ../lf2-lite (GitHub Pages path /playground/sims/lf2-lite/)
```
