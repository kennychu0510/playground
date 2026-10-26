# Squash 3D

Semi-cartoon squash rally. Run the court, hold a shot to charge, and release when the ball arrives. Timing is graded Perfect, Good, Early, or Late. First to 11, win by 2, against a solo opponent.

The control scheme follows the same idea as [pickleball.daniellin.tw](https://pickleball.daniellin.tw): a third-person court, a charge bar, a five-button shot pad, and an AI rally to a target score. Shots and rules are squash: drive, cross, drop, lob, and boast, with the tin, service boxes, and double-bounce.

## Stack

- Vite + TypeScript
- Three.js

## Play

- **WASD** or arrows to run. Near the ball, sideways position lines up on its own when you are not steering.
- **Hold** J / K / U / L / I to charge, **release** to hit. **A** and **D** at the release aim the ball.
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
