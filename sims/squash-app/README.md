# Squash Lab (source)

First-person 3D squash prototype: pause-to-aim (Swipe Soccer style), power gauge, Rapier physics, PSA-inspired bots.

## Stack

- Vite + TypeScript
- Three.js
- `@dimforge/rapier3d-compat`
- Zustand

## Develop

```bash
cd sims/squash-app
npm install
npm run dev
```

## Build for GitHub Pages

Outputs static files to `../squash` (served at `/playground/sims/squash/`).

```bash
npm run build
```

`base` in `vite.config.ts` is `/playground/sims/squash/`.
