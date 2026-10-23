# Dragonboat Lab (v2)

Vanilla HTML + canvas: tune dragonboat paddle stroke **and crew sync**, then race 100&nbsp;m.

Inspired by Swim Finder on [zounoashi.com](https://www.zounoashi.com/#/game/swim-finder) — **no npm, no bundler**. Part of [Kenny’s playground](../../).

## Open locally

From the playground repository root:

```bash
python3 -m http.server 8765
# http://localhost:8765/sims/dragonboat/
```

## Defaults (competent 20-seat crew)

| Knob | Default | Range |
|------|---------|-------|
| Stroke length | 1.35 m | 0.6–2.0 |
| Insert depth | 32 cm | 8–65 |
| Insert angle | **35°** (0 = vertical, 45 = forward catch) | 0–45 |
| Rate | 72 spm | 40–95 |
| Effort | 100% | 60–120 |
| Crew size | 20 | 2–20 |
| Sync quality | 85% | 0–100 |
| Pace variance | 15% | 0–100 |

Race: **100 m standing start** (default crew ≈ **34 s**). Pause / Resume / Restart mid-run. Live speed + pace graph.

## Physics (toy — see `physics.js`)

Phases: **reach → catch → pull/drive → exit → recovery** (rate-dependent fractions).

**Hull drag**

\[
F_\mathrm{drag} = -k_d(N)\, v\, |v|
\]

**Per-paddler drive** (catch/drive/exit only), summed over crew:

\[
v_\mathrm{rel} = \max(L / T_\mathrm{water} - s\, v_\mathrm{boat},\, v_\mathrm{floor})
\]

\[
\eta_\mathrm{angle} = \mathrm{floor} + (1-\mathrm{floor})\,
\exp\!\Big(-\frac{(\theta - 38^\circ)^2}{2\sigma^2}\Big)
\quad \theta \in [0^\circ,45^\circ]
\]

\[
F_i = e\cdot \tfrac12\rho\, C_d\, A_\mathrm{eff}\, v_\mathrm{rel}^2\, \eta_\mathrm{angle}\, \mathrm{shape}(\mathrm{phase}_i)
\]

Sync &lt; 100% spreads phase offsets (“caterpillaring”). Late/over-long exit adds a **negative-blade** drag penalty. Mass = boat + 75 kg × crew.

Coaching refs encoded as comments: London Dragon Boat Club, Oyster Point Dragons (~45° catch, exit mid-thigh), Dragon Boat Net biomechanics, sync / caterpillar lore, ISBS-ish rate vs water-phase.

## License

Prototype for Kenny — use freely.
