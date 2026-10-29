/** Top-down city draw phase — canvas 2D. */

import { padCenter, pointInPad } from "./levels.js";

const INK = "#3a1f14";
const INK_GLOW = "rgba(90, 40, 20, 0.35)";
const HINT = "#6b3a28";
const TEAL = "#2bb8b0";
const GOAL_Y = "#f0c419";

/**
 * @typedef {{x:number,y:number,t:number}} StrokePoint
 */

export class DrawPhase {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onStrokeStart?: () => void,
   *   onStrokeEnd?: (stroke: StrokePoint[], meta: {reachedGoal:boolean, endedOnPad:boolean}) => void,
   *   onHint?: (text:string, warn?:boolean) => void
   * }} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hooks = hooks;
    this.stage = null;
    this.stroke = /** @type {StrokePoint[]} */ ([]);
    this.drawing = false;
    this.active = false;
    this._bound = false;
    this._raf = 0;
    this._pulse = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._loop = this._loop.bind(this);
  }

  /** @param {import('./levels.js').Stage} stage */
  start(stage) {
    this.stage = stage;
    this.stroke = [];
    this.drawing = false;
    this.active = true;
    this.canvas.classList.remove("hidden");
    this._bind();
    this.hooks.onHint?.("Draw from your feet to GOAL in one stroke!");
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.active = false;
    this.drawing = false;
    this._unbind();
    cancelAnimationFrame(this._raf);
  }

  hide() {
    this.stop();
    this.canvas.classList.add("hidden");
  }

  show() {
    this.canvas.classList.remove("hidden");
  }

  /** Current stroke in normalized coords with timestamps. */
  getStroke() {
    return this.stroke.slice();
  }

  /** Render a review frame with optional fall mark. */
  paintReview(targetCanvas, stroke, fallUV = null) {
    const c = targetCanvas;
    const ctx = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    this._paintMap(ctx, W, H, this.stage, stroke, { fallUV, review: true });
  }

  // ---- input ----
  _bind() {
    if (this._bound) return;
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerUp);
    this._bound = true;
  }
  _unbind() {
    if (!this._bound) return;
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("pointercancel", this._onPointerUp);
    this._bound = false;
  }

  _normFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  _onPointerDown(e) {
    if (!this.active || !this.stage || this.drawing) return;
    const p = this._normFromEvent(e);
    const start = this.stage.start;
    const c = padCenter(start);
    // Must begin near the worker / foothold ring
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    if (dx * dx + dy * dy > 0.045 * 0.045 && !pointInPad(p.x, p.y, start, 0.04)) {
      this.hooks.onHint?.("Start from the START pad!", true);
      return;
    }
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.stroke = [{ x: c.x, y: c.y, t: performance.now() }];
    this._push(p.x, p.y);
    this.hooks.onStrokeStart?.();
    this.hooks.onHint?.("Draw a line to GOAL");
  }

  _onPointerMove(e) {
    if (!this.drawing) return;
    e.preventDefault();
    const p = this._normFromEvent(e);
    this._push(p.x, p.y);
    if (pointInPad(p.x, p.y, this.stage.goal, 0.01)) {
      this.hooks.onHint?.("Connect to the GOAL pad");
    }
  }

  _onPointerUp(e) {
    if (!this.drawing) return;
    e?.preventDefault?.();
    this.drawing = false;
    const last = this.stroke[this.stroke.length - 1];
    const reachedGoal = last ? pointInPad(last.x, last.y, this.stage.goal, 0.03) : false;
    const endedOnPad = reachedGoal;
    if (!reachedGoal) {
      this.hooks.onHint?.("Line must reach GOAL — walking anyway…", true);
    }
    this.active = false;
    this._unbind();
    this.hooks.onStrokeEnd?.(this.stroke.slice(), { reachedGoal, endedOnPad });
  }

  _push(x, y) {
    const last = this.stroke[this.stroke.length - 1];
    const t = performance.now();
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < 0.00008) {
        // still update time for speed sampling on hold? skip
        return;
      }
    }
    this.stroke.push({ x, y, t });
  }

  // ---- render ----
  _loop(now) {
    if (!this.active && !this.drawing) {
      // one last paint when idle after stroke is fine; stop loop when fully stopped
    }
    this._pulse = now;
    if (this.stage) {
      const { width: W, height: H } = this.canvas;
      this._paintMap(this.ctx, W, H, this.stage, this.stroke, { pulse: now });
    }
    if (this.active || this.drawing) {
      this._raf = requestAnimationFrame(this._loop);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W
   * @param {number} H
   * @param {import('./levels.js').Stage} stage
   * @param {StrokePoint[]} stroke
   * @param {{pulse?:number, fallUV?:{x:number,y:number}|null, review?:boolean}} opts
   */
  _paintMap(ctx, W, H, stage, stroke, opts = {}) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // City streets
    ctx.fillStyle = "#5a5e66";
    ctx.fillRect(0, 0, W, H);

    // Block grid
    const seed = stage.mapSeed;
    const rng = mulberry32(seed);
    // Outer building roofs (darker blocks around)
    for (let i = 0; i < 18; i++) {
      const bx = rng() * W;
      const by = rng() * H;
      const bw = 40 + rng() * 90;
      const bh = 40 + rng() * 90;
      ctx.fillStyle = rng() > 0.5 ? "#3d4148" : "#34383f";
      ctx.fillRect(bx, by, bw, bh);
    }

    // Road lanes + crosswalks
    this._paintRoads(ctx, W, H);

    // Construction pit in center
    const pitX = W * 0.22;
    const pitY = H * 0.32;
    const pitW = W * 0.56;
    const pitH = H * 0.34;
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(pitX, pitY, pitW, pitH);
    // tire tracks
    ctx.strokeStyle = "rgba(40,25,12,0.35)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(pitX + 20 + i * 18, pitY + 10);
      ctx.quadraticCurveTo(pitX + pitW * 0.5, pitY + pitH * (0.3 + i * 0.1), pitX + pitW - 30, pitY + pitH - 20);
      ctx.stroke();
    }
    // excavator + truck (simple)
    this._paintExcavator(ctx, pitX + pitW * 0.55, pitY + pitH * 0.55, 1 + (seed % 3) * 0.05);
    this._paintTruck(ctx, pitX + pitW * 0.2, pitY + pitH * 0.65);

    // Trees
    for (let i = 0; i < 10; i++) {
      const tx = (0.08 + ((seed * (i + 3)) % 17) / 20) * W;
      const ty = (0.08 + ((seed * (i + 7)) % 19) / 22) * H;
      this._paintTree(ctx, tx, ty, 10 + (i % 3) * 2);
    }

    // Steel roof frames under pads
    this._paintSteelRoof(ctx, W, H, stage.start);
    this._paintSteelRoof(ctx, W, H, stage.goal);

    // Obstacles (building cores)
    for (const ob of stage.obstacles) {
      const x = ob.x * W;
      const y = ob.y * H;
      const w = ob.w * W;
      const h = ob.h * H;
      ctx.fillStyle = "#2c3038";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#3a404c";
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      // windows
      ctx.fillStyle = "#1e2228";
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillRect(x + 10 + col * ((w - 20) / 3), y + 10 + row * ((h - 20) / 4), 8, 8);
        }
      }
    }

    // Hint girder
    if (stage.hintBeam) {
      const a = padCenter(stage.start);
      const b = padCenter(stage.goal);
      ctx.strokeStyle = HINT;
      ctx.lineWidth = Math.max(10, W * 0.028);
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(a.x * W, a.y * H);
      ctx.lineTo(b.x * W, b.y * H);
      ctx.stroke();
      // rivets
      ctx.fillStyle = "#4a2818";
      const n = 8;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        ctx.beginPath();
        ctx.arc(lerp(a.x, b.x, t) * W, lerp(a.y, b.y, t) * H, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pads
    this._paintPad(ctx, W, H, stage.start, "START", TEAL);
    this._paintPad(ctx, W, H, stage.goal, "GOAL", GOAL_Y);

    // Player stroke
    if (stroke && stroke.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK_GLOW;
      ctx.lineWidth = Math.max(16, W * 0.04);
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * W, stroke[0].y * H);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * W, stroke[i].y * H);
      }
      ctx.stroke();

      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(10, W * 0.028);
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * W, stroke[0].y * H);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * W, stroke[i].y * H);
      }
      ctx.stroke();
    }

    // Worker on start
    const sc = padCenter(stage.start);
    this._paintWorker(ctx, sc.x * W, sc.y * H, opts.pulse || 0, !opts.review);

    // Fall mark
    if (opts.fallUV) {
      const fx = opts.fallUV.x * W;
      const fy = opts.fallUV.y * H;
      ctx.strokeStyle = "#e23b3b";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(fx - 18, fy - 18);
      ctx.lineTo(fx + 18, fy + 18);
      ctx.moveTo(fx + 18, fy - 18);
      ctx.lineTo(fx - 18, fy + 18);
      ctx.stroke();
      ctx.fillStyle = "#e23b3b";
      ctx.font = `bold ${Math.max(14, W * 0.04)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("FALL", fx, fy + 32);
    }

    ctx.restore();
  }

  _paintRoads(ctx, W, H) {
    // Cross streets
    ctx.fillStyle = "#6a6e76";
    ctx.fillRect(0, H * 0.08, W, H * 0.1);
    ctx.fillRect(0, H * 0.82, W, H * 0.1);
    ctx.fillRect(W * 0.08, 0, W * 0.12, H);
    ctx.fillRect(W * 0.8, 0, W * 0.12, H);

    // Lane dashes
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.13);
    ctx.lineTo(W, H * 0.13);
    ctx.moveTo(0, H * 0.87);
    ctx.lineTo(W, H * 0.87);
    ctx.moveTo(W * 0.14, 0);
    ctx.lineTo(W * 0.14, H);
    ctx.moveTo(W * 0.86, 0);
    ctx.lineTo(W * 0.86, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosswalks
    this._crosswalk(ctx, W * 0.08, H * 0.08, W * 0.12, H * 0.1, true);
    this._crosswalk(ctx, W * 0.8, H * 0.08, W * 0.12, H * 0.1, true);
    this._crosswalk(ctx, W * 0.08, H * 0.82, W * 0.12, H * 0.1, true);
    this._crosswalk(ctx, W * 0.8, H * 0.82, W * 0.12, H * 0.1, true);
  }

  _crosswalk(ctx, x, y, w, h, verticalBars) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const n = 6;
    if (verticalBars) {
      const bw = w / (n * 1.6);
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x + i * (w / n) + 2, y + 4, bw, h - 8);
      }
    }
  }

  _paintSteelRoof(ctx, W, H, pad) {
    const x = pad.x * W - 8;
    const y = pad.y * H - 8;
    const w = pad.w * W + 16;
    const h = pad.h * H + 16;
    ctx.fillStyle = "#4a2c1c";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#2a160e";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    // girder lines
    ctx.strokeStyle = "rgba(20,10,5,0.4)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w * i) / 4, y);
      ctx.lineTo(x + (w * i) / 4, y + h);
      ctx.stroke();
    }
  }

  _paintPad(ctx, W, H, pad, label, color) {
    const x = pad.x * W;
    const y = pad.y * H;
    const w = pad.w * W;
    const h = pad.h * H;

    // concrete
    ctx.fillStyle = "#9aa0a8";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#b0b6be";
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);

    // hazard corners
    const stripe = 14;
    this._hazardCorner(ctx, x, y, stripe, 1);
    this._hazardCorner(ctx, x + w, y, stripe, 2);
    this._hazardCorner(ctx, x, y + h, stripe, 3);
    this._hazardCorner(ctx, x + w, y + h, stripe, 4);

    // cones
    this._cone(ctx, x + 8, y + 8);
    this._cone(ctx, x + w - 8, y + 8);
    this._cone(ctx, x + 8, y + h - 8);
    this._cone(ctx, x + w - 8, y + h - 8);

    // plaque
    ctx.save();
    ctx.translate(x + w / 2, y + h * 0.28);
    ctx.rotate(-0.08);
    ctx.fillStyle = color;
    ctx.fillRect(-w * 0.28, -10, w * 0.56, 22);
    ctx.fillStyle = "#111";
    ctx.font = `bold ${Math.max(12, w * 0.14)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  _hazardCorner(ctx, cx, cy, size, corner) {
    ctx.save();
    ctx.beginPath();
    if (corner === 1) {
      ctx.moveTo(cx, cy); ctx.lineTo(cx + size, cy); ctx.lineTo(cx, cy + size);
    } else if (corner === 2) {
      ctx.moveTo(cx, cy); ctx.lineTo(cx - size, cy); ctx.lineTo(cx, cy + size);
    } else if (corner === 3) {
      ctx.moveTo(cx, cy); ctx.lineTo(cx + size, cy); ctx.lineTo(cx, cy - size);
    } else {
      ctx.moveTo(cx, cy); ctx.lineTo(cx - size, cy); ctx.lineTo(cx, cy - size);
    }
    ctx.clip();
    for (let i = -2; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#f0c419" : "#111";
      ctx.fillRect(cx - size + i * 6, cy - size, 6, size * 2);
    }
    ctx.restore();
  }

  _cone(ctx, x, y) {
    ctx.fillStyle = "#ff7a1a";
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 5, y + 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 3, y - 1, 6, 2);
  }

  _paintWorker(ctx, x, y, pulse, withRing) {
    if (withRing) {
      const r = 22 + Math.sin(pulse * 0.006) * 2;
      ctx.strokeStyle = TEAL;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(43,184,176,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
      // guide lines to upper corners of pad (visual cue)
      ctx.strokeStyle = "rgba(80,160,220,0.7)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 28, y - 22);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 28, y - 22);
      ctx.stroke();
    }
    // body
    ctx.fillStyle = "#1e3a6e";
    ctx.fillRect(x - 7, y - 4, 14, 16);
    ctx.fillStyle = "#c4a574";
    ctx.beginPath();
    ctx.arc(x, y - 8, 7, 0, Math.PI * 2);
    ctx.fill();
    // hard hat
    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.ellipse(x, y - 12, 9, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 9, y - 12, 18, 3);
    // pants
    ctx.fillStyle = "#c9b07a";
    ctx.fillRect(x - 7, y + 10, 6, 8);
    ctx.fillRect(x + 1, y + 10, 6, 8);
  }

  _paintTree(ctx, x, y, r) {
    ctx.fillStyle = "#3d8c4a";
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.9, y + r * 0.5);
    ctx.lineTo(x - r * 0.9, y + r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2f6b38";
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.4);
    ctx.lineTo(x + r * 0.7, y + r * 0.7);
    ctx.lineTo(x - r * 0.7, y + r * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  _paintExcavator(ctx, x, y, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "#f0c419";
    ctx.fillRect(-14, -6, 28, 12);
    ctx.fillRect(8, -16, 8, 12);
    ctx.strokeStyle = "#f0c419";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -16);
    ctx.lineTo(26, -28);
    ctx.lineTo(30, -18);
    ctx.stroke();
    ctx.fillStyle = "#333";
    ctx.fillRect(-16, 4, 32, 5);
    ctx.restore();
  }

  _paintTruck(ctx, x, y) {
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(x, y, 28, 12);
    ctx.fillStyle = "#4aa3d8";
    ctx.fillRect(x + 18, y - 6, 10, 10);
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x + 6, y + 12, 3, 0, Math.PI * 2);
    ctx.arc(x + 22, y + 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
