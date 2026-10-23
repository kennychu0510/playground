# Dragonboat Lab

Vanilla HTML + canvas prototype: tune dragonboat paddle stroke parameters and race 100&nbsp;m to see how technique changes speed.

Inspired by the Swim Finder pattern on [zounoashi.com](https://www.zounoashi.com/#/game/swim-finder) — **no npm, no bundler, no frameworks**.

Part of [Kenny’s playground](../../). Homepage card links here at `sims/dragonboat/`.

## Open locally

From the playground repository root:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/sims/dragonboat/
```

Or open this folder’s `index.html` directly in a browser (`file://` works; no external CDNs).

## Files

| File | Role |
|------|------|
| `index.html` | Shell + slider UI overlays |
| `style.css` | Mobile-first portrait layout |
| `physics.js` | 1D boat + stroke toy model (read this) |
| `game.js` | States INTRO→EDIT→RUN→RESULT + canvas scene |

## Default stroke (competent crew)

- Stroke length **1.35 m**
- Insert depth **32 cm**
- Insert angle **12°** from vertical
- Rate **72 spm**
- Effort **100%**
- Race: **100 m standing start**

## Physics (toy — see comments in `physics.js`)

**Hull drag**

\[
F_\mathrm{drag} = -k_d\, v\, |v|
\]

**Drive thrust** (water phase only)

\[
v_\mathrm{rel} = \max(\underbrace{L / T_\mathrm{water}}_{\text{pull speed}} - s\, v_\mathrm{boat},\, v_\mathrm{floor})
\]

\[
A_\mathrm{eff} = w_\mathrm{blade}\cdot d_\mathrm{soft}(d)
\]

\[
\eta_\mathrm{angle} = \exp\!\Big(-\frac{(\theta - \theta_\mathrm{peak})^2}{2\sigma^2}\Big)
\quad(\theta_\mathrm{peak}\approx 10°)
\]

\[
F_\mathrm{thrust} = N_\mathrm{blades}\cdot e\cdot \tfrac12\rho\, C_d\, A_\mathrm{eff}\, v_\mathrm{rel}^2\, \eta_\mathrm{angle}
\]

Recovery phase: hull drag only. Semi-implicit Euler @ 60 Hz.

## Knobs worth tuning next

- `CFG.hullDragK` / `CFG.massKg` — top speed & acceleration feel
- `CFG.crewBlades` — how strong one “unison” stroke is
- `CFG.anglePeakDeg` / `CFG.angleWidthDeg` — catch-angle sweet spot
- `CFG.slip` — how much boat speed kills blade relative flow
- Water-fraction vs depth penalty — recovery realism
- Multi-paddler timing offset / left-right side view
- Bilingual EN/中文 UI

## License

Prototype for Kenny — use freely.
