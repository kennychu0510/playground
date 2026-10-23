# Basketball Machine (source)

Arcade basketball shootout — flick to shoot, stage goals + timer, moving hoops.

## Stack

- Vite + TypeScript
- Three.js
- `@dimforge/rapier3d-compat`

## Scoring rules

| Event | Points |
| --- | --- |
| Made basket (rim touch OK) | **2** |
| Swish (through hoop, no rim contact) | **3** |
| Streak bonus (3rd+ consecutive make) | **+1** each |

- Continuous shots (no ball limit); stage ends on timer or goal.
- Each stage has a **point goal** and a **countdown** (see stages below).
- Reach the goal before time runs out → stage clear → Next.
- Time out without goal → Retry stage. Total score carries across stages.

## Stages

1. **Steady Shot** — static hoop · 45s · goal **20**
2. **Side Slide** — hoop slides L/R slowly · 50s · goal **24**
3. **Wave** — faster L/R + slight depth sway · 55s · goal **28**
4. **Tight Orbit** — smaller rim + figure-eight · 60s · goal **32**

## Develop

```bash
cd sims/basketball-machine-app
npm install
npm run dev
```

## Build for GitHub Pages

Outputs to `../basketball-machine` (served at `/playground/sims/basketball-machine/`).

```bash
npm run build
```
