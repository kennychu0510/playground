# Squash 3D

Semi-cartoon squash rally. Run the court and press a shot as the ball arrives. Each shot has its own pace. Timing is graded Perfect, Good, Early, or Late. First to 11, win by 2, against a solo opponent.

The control scheme follows the same idea as [pickleball.daniellin.tw](https://pickleball.daniellin.tw): a third-person court, a five-button shot pad, and an AI rally to a target score. Shots and rules are squash: drive, cross, drop, lob, and boast, with the tin, service boxes, and double-bounce.

## Stack

- Vite + TypeScript
- Three.js

## Play

- **WASD** or arrows to run. Near the ball, sideways position lines up on its own when you are not steering.
- **Press** J / K / U / L / I to hit. The shot sets the power. **A** and **D** aim the ball.
- **Space** serves. Even scores from the right box, odd scores from the left.
- On a phone, use the stick and the shot buttons.

## Develop

```bash
cd sims/squash-app
npm install
npm run dev
```

Open the Vite URL with the `/playground/sims/squash/` base path.

## Build for GitHub Pages

Outputs static files to `../squash` (served at `/playground/sims/squash/`).

```bash
npm run build
```
