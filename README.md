# Playground

Kenny’s static hub for small web games and simulations. No build step and no frameworks. GitHub Pages serves this repository from the **root of `main`**.

**Live site:** https://kennychu0510.github.io/playground/

## Preview locally

From the repository root:

```bash
python3 -m http.server 8765
```

Open http://localhost:8765/ . The homepage lists each sim. Dragonboat Lab is at http://localhost:8765/sims/dragonboat/ .

Use a local server so relative links match GitHub Pages. Opening the hub `index.html` via `file://` still follows the card link on most browsers, but a local server is the reliable preview.

## Add a sim

1. Create a folder under `sims/`, for example `sims/my-game/`, with its own `index.html` and any CSS or scripts. Keep asset paths relative (`style.css`, `game.js`) so the sim works from that subdirectory on a project site (`https://kennychu0510.github.io/playground/`).
2. Add a card on the homepage (`index.html`) that links to `sims/my-game/` and includes a name, a one-line blurb, and a tag.
3. Commit to `main`. Pages rebuilds from the root of that branch.

## GitHub Pages

In the repository: **Settings → Pages → Build and deployment**.

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/ (root)**

Save. The site is published at https://kennychu0510.github.io/playground/ . The first deploy can take a minute.

`.nojekyll` in the repo root tells Pages to skip Jekyll, so a later folder whose name starts with `_` is still served.

## Sims

| Sim | Path | What it is |
|-----|------|------------|
| Dragonboat Lab | [`sims/dragonboat/`](sims/dragonboat/) | Tune paddle stroke length, depth, angle, and rate; race 100 m. |
