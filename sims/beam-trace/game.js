/** One-Stroke Beam Walk — English remake (draw → 3D walk). */

import { STAGES, STAGE_COUNT } from "./levels.js";
import { DrawPhase } from "./draw.js";
import { Walk3D } from "./walk3d.js";
import { UI } from "./ui.js";

const drawCanvas = document.getElementById("draw-canvas");
const walkCanvas = document.getElementById("walk-canvas");
const reviewCanvas = document.getElementById("review-canvas");

const ui = new UI();

/** @type {"title"|"draw"|"walk"|"clear"|"fail"|"review"|"done"} */
let mode = "title";
let stageIndex = 0;
let totalTime = 0;
let stageTime = 0;
let timing = false;
let cleared = 0;
/** @type {import('./draw.js').StrokePoint[]} */
let lastStroke = [];
let lastFallUV = null;
let lastReachedGoal = false;

const draw = new DrawPhase(drawCanvas, {
  onStrokeStart() {
    if (!timing) timing = true;
    ui.setHint("Draw a line to GOAL");
  },
  onHint(text, warn) {
    ui.setHint(text, warn);
  },
  onStrokeEnd(stroke, meta) {
    lastStroke = stroke;
    lastReachedGoal = meta.reachedGoal;
    beginWalk(stroke, meta);
  },
});

const walk = new Walk3D(walkCanvas, {
  onSpeed(kmh, gait) {
    ui.setSpeed(kmh, gait);
  },
  onClear() {
    timing = false;
    mode = "clear";
    ui.showWalkStats(false);
    ui.hideHint();
    cleared = stageIndex + 1;
    ui.showClear(stageTime, STAGES[stageIndex]);
  },
  onFall(fallUV) {
    timing = false;
    mode = "fail";
    lastFallUV = fallUV;
    ui.showWalkStats(false);
    ui.hideHint();
    ui.showFail(totalTime, STAGES[stageIndex], cleared);
  },
});

function resizeDrawCanvas() {
  const shell = document.getElementById("game-shell");
  const w = shell.clientWidth;
  const h = shell.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  drawCanvas.width = Math.round(w * dpr);
  drawCanvas.height = Math.round(h * dpr);
}

function beginStage(i) {
  stageIndex = i;
  const stage = STAGES[stageIndex];
  stageTime = 0;
  lastStroke = [];
  lastFallUV = null;
  mode = "draw";

  walk.deactivate();
  walkCanvas.classList.remove("active");
  resizeDrawCanvas();
  ui.hidePanels();
  ui.showHud(true);
  ui.setStage(stage.id, stage.alt);
  ui.setTime(totalTime);
  ui.showWalkStats(false);
  ui.setFF(false);
  ui.setHint("Draw from your feet to GOAL in one stroke!");
  timing = true;

  draw.show();
  draw.start(stage);
}

function beginWalk(stroke, meta) {
  mode = "walk";
  draw.hide();
  ui.hideHint();
  ui.showWalkStats(true);
  ui.setHint("", false);
  document.getElementById("hint-banner").classList.add("hidden");

  const stage = STAGES[stageIndex];
  // If stroke never reached goal, still walk then fall at the tip
  walk.start(stage, stroke, { reachedGoal: meta.reachedGoal });
}

function resetRun() {
  totalTime = 0;
  stageTime = 0;
  cleared = 0;
  timing = false;
  stageIndex = 0;
}

// ---- buttons ----
document.getElementById("btn-start").addEventListener("click", () => {
  resetRun();
  beginStage(0);
});

document.getElementById("btn-next").addEventListener("click", () => {
  if (stageIndex + 1 >= STAGE_COUNT) {
    mode = "done";
    walk.deactivate();
    ui.showHud(false);
    ui.showDone(totalTime);
    return;
  }
  beginStage(stageIndex + 1);
});

document.getElementById("btn-retry").addEventListener("click", () => {
  // retry from stage 1 with fresh total (arcade style) — or same stage?
  // Original retries the run; keep full restart for fair total-time race.
  resetRun();
  beginStage(0);
});

document.getElementById("btn-see-line").addEventListener("click", () => {
  mode = "review";
  document.getElementById("review-ribbon").textContent =
    `STAGE ${STAGES[stageIndex].id} — fell at the ✕`;
  // size review canvas
  reviewCanvas.width = 540;
  reviewCanvas.height = 720;
  draw.stage = STAGES[stageIndex];
  draw.paintReview(reviewCanvas, lastStroke, lastFallUV);
  ui.showReview();
});

document.getElementById("btn-review-back").addEventListener("click", () => {
  mode = "fail";
  ui.showFail(totalTime, STAGES[stageIndex], cleared);
});

document.getElementById("btn-title").addEventListener("click", goTitle);
document.getElementById("btn-done-title").addEventListener("click", goTitle);
document.getElementById("btn-again").addEventListener("click", () => {
  resetRun();
  beginStage(0);
});

document.getElementById("btn-ff").addEventListener("click", () => {
  const on = !walk.fastForward;
  walk.setFastForward(on);
  ui.setFF(on);
});

function goTitle() {
  mode = "title";
  timing = false;
  walk.deactivate();
  draw.hide();
  ui.showHud(false);
  ui.showTitle();
  // paint a static preview on draw canvas behind title? optional
  resizeDrawCanvas();
  draw.stage = STAGES[0];
  draw.show();
  draw.stroke = [];
  draw._paintMap(draw.ctx, drawCanvas.width, drawCanvas.height, STAGES[0], [], {});
}

// ---- clock ----
let lastTs = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;
  if (timing && (mode === "draw" || mode === "walk")) {
    stageTime += dt;
    totalTime += dt;
    ui.setTime(totalTime);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener("resize", () => {
  resizeDrawCanvas();
  if (mode === "draw" && draw.stage) {
    draw._paintMap(draw.ctx, drawCanvas.width, drawCanvas.height, draw.stage, draw.stroke, {
      pulse: performance.now(),
    });
  }
});

// boot
resizeDrawCanvas();
goTitle();
