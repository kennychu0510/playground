/* Beam Trace — original one-stroke beam walk (vanilla canvas) */
(() => {
  "use strict";

  const W = 540;
  const H = 720;
  const BEAM_W = 14;
  const MIN_SEG = 6;
  const PAD_TOL = 28;
  const WALK_SPEED = 160; // px / s
  const FALL_G = 980;

  const LEVELS = [
    {
      name: "Short Span",
      start: { x: 36, y: 460, w: 100, h: 22 },
      goal: { x: 404, y: 460, w: 100, h: 22 },
      blocks: [],
    },
    {
      name: "Wide Gap",
      start: { x: 24, y: 430, w: 86, h: 22 },
      goal: { x: 430, y: 430, w: 86, h: 22 },
      blocks: [],
    },
    {
      name: "High Rise",
      start: { x: 36, y: 540, w: 100, h: 22 },
      goal: { x: 390, y: 210, w: 100, h: 22 },
      blocks: [],
    },
    {
      name: "Drop Zone",
      start: { x: 36, y: 180, w: 100, h: 22 },
      goal: { x: 390, y: 520, w: 100, h: 22 },
      blocks: [],
    },
    {
      name: "Around the Core",
      start: { x: 20, y: 460, w: 80, h: 22 },
      goal: { x: 440, y: 460, w: 80, h: 22 },
      blocks: [{ x: 210, y: 250, w: 120, h: 320 }],
    },
  ];

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const hudStage = document.getElementById("hud-stage");
  const hudTime = document.getElementById("hud-time");
  const panels = {
    intro: document.getElementById("panel-intro"),
    fail: document.getElementById("panel-fail"),
    clear: document.getElementById("panel-clear"),
    done: document.getElementById("panel-done"),
  };

  const btn = {
    start: document.getElementById("btn-start"),
    retry: document.getElementById("btn-retry"),
    redraw: document.getElementById("btn-redraw"),
    next: document.getElementById("btn-next"),
    replay: document.getElementById("btn-replay"),
    again: document.getElementById("btn-again"),
    undo: document.getElementById("btn-undo"),
    clear: document.getElementById("btn-clear"),
    restart: document.getElementById("btn-restart"),
  };

  /** @type {"intro"|"draw"|"walk"|"fail"|"clear"|"done"} */
  let mode = "intro";
  let levelIndex = 0;
  let points = [];
  let drawing = false;
  let walkT = 0;
  let walkLen = 0;
  let pathLens = [];
  let totalLen = 0;
  let stageTime = 0;
  let totalTime = 0;
  let timing = false;
  let walker = { x: 0, y: 0, angle: 0, falling: false, vx: 0, vy: 0 };
  let failReason = "";
  let particles = [];
  let lastTs = 0;
  let hintPulse = 0;
  let message = "";
  let messageUntil = 0;

  function level() {
    return LEVELS[levelIndex];
  }

  function showPanel(name) {
    for (const [k, el] of Object.entries(panels)) {
      el.classList.toggle("hidden", k !== name);
    }
  }

  function hidePanels() {
    for (const el of Object.values(panels)) el.classList.add("hidden");
  }

  function setHud() {
    hudStage.textContent = `Stage ${levelIndex + 1}/${LEVELS.length}`;
    hudTime.textContent = `${stageTime.toFixed(2)} s`;
  }

  function padTop(pad) {
    return { x: pad.x, y: pad.y, w: pad.w, h: 0 };
  }

  function nearPadTop(p, pad) {
    const left = pad.x - PAD_TOL;
    const right = pad.x + pad.w + PAD_TOL;
    const top = pad.y - PAD_TOL;
    const bottom = pad.y + PAD_TOL * 0.7;
    return p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  }

  function onPadSurface(p, pad) {
    return (
      p.x >= pad.x - 4 &&
      p.x <= pad.x + pad.w + 4 &&
      p.y >= pad.y - BEAM_W &&
      p.y <= pad.y + 8
    );
  }

  function dist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function segIntersectRect(a, b, r) {
    // Cohen-like: sample along segment
    const steps = Math.max(4, Math.ceil(dist(a, b) / 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  function pathHitsBlocks(pts, blocks) {
    for (const block of blocks) {
      for (let i = 1; i < pts.length; i++) {
        if (segIntersectRect(pts[i - 1], pts[i], block)) return true;
      }
    }
    return false;
  }

  function rebuildLengths() {
    pathLens = [0];
    totalLen = 0;
    for (let i = 1; i < points.length; i++) {
      totalLen += dist(points[i - 1], points[i]);
      pathLens.push(totalLen);
    }
  }

  function pointAt(s) {
    if (points.length === 0) return { x: 0, y: 0, angle: 0 };
    if (s <= 0) {
      const a = points[0];
      const b = points[1] || a;
      return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    if (s >= totalLen) {
      const a = points[points.length - 2] || points[0];
      const b = points[points.length - 1];
      return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    let i = 1;
    while (i < pathLens.length && pathLens[i] < s) i++;
    const s0 = pathLens[i - 1];
    const s1 = pathLens[i];
    const t = (s - s0) / Math.max(1e-6, s1 - s0);
    const a = points[i - 1];
    const b = points[i];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function flash(msg, ms = 1600) {
    message = msg;
    messageUntil = performance.now() + ms;
  }

  function resetStage(keepTotal = true) {
    points = [];
    drawing = false;
    walkT = 0;
    walkLen = 0;
    totalLen = 0;
    pathLens = [];
    stageTime = 0;
    timing = false;
    walker.falling = false;
    walker.vx = 0;
    walker.vy = 0;
    particles = [];
    failReason = "";
    const L = level();
    walker.x = L.start.x + L.start.w * 0.5;
    walker.y = L.start.y - 10;
    walker.angle = 0;
    mode = "draw";
    hidePanels();
    updateDock();
    setHud();
  }

  function updateDock() {
    const canEdit = mode === "draw" && !drawing;
    btn.undo.disabled = !(canEdit && points.length > 1);
    btn.clear.disabled = !(canEdit && points.length > 0);
  }

  function beginWalk() {
    rebuildLengths();
    if (points.length < 2 || totalLen < 40) {
      flash("Beam too short — keep drawing");
      points = [];
      updateDock();
      return;
    }
    const L = level();
    const end = points[points.length - 1];
    if (!nearPadTop(end, L.goal) && !onPadSurface(end, L.goal)) {
      flash("Finish on the GOAL pad");
      // keep line so they can undo/clear
      updateDock();
      return;
    }
    if (pathHitsBlocks(points, L.blocks)) {
      flash("Beam hits the core — redraw");
      points = [];
      updateDock();
      return;
    }
    // Snap end onto goal surface
    end.y = Math.min(end.y, L.goal.y);
    rebuildLengths();
    walkLen = 0;
    stageTime = 0;
    timing = true;
    mode = "walk";
    drawing = false;
    updateDock();
  }

  function triggerFail(reason) {
    mode = "fail";
    timing = false;
    failReason = reason;
    walker.falling = true;
    walker.vy = 40;
    document.getElementById("fail-msg").textContent = reason;
    document.getElementById("fail-time").textContent = stageTime.toFixed(2);
    spawnSparks(walker.x, walker.y);
    showPanel("fail");
    updateDock();
  }

  function triggerClear() {
    mode = "clear";
    timing = false;
    totalTime += stageTime;
    document.getElementById("clear-msg").textContent = `${level().name} clear`;
    document.getElementById("clear-time").textContent = stageTime.toFixed(2);
    spawnSparks(walker.x, walker.y, true);
    if (levelIndex >= LEVELS.length - 1) {
      document.getElementById("done-time").textContent = totalTime.toFixed(2);
      mode = "done";
      showPanel("done");
    } else {
      showPanel("clear");
    }
    updateDock();
  }

  function spawnSparks(x, y, gold = false) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.4 + Math.random() * 0.5,
        color: gold ? "#f0b429" : "#3ecf8e",
      });
    }
  }

  function onPointerDown(e) {
    if (mode !== "draw") return;
    e.preventDefault();
    const p = canvasPoint(e);
    const L = level();
    if (points.length === 0) {
      if (!nearPadTop(p, L.start)) {
        flash("Start on the green START pad");
        return;
      }
      // Snap onto pad top
      points = [{ x: Math.max(L.start.x, Math.min(L.start.x + L.start.w, p.x)), y: L.start.y }];
      drawing = true;
      updateDock();
      return;
    }
    // Continue from last point if near
    const last = points[points.length - 1];
    if (dist(p, last) < 40) {
      drawing = true;
    } else {
      flash("One stroke — continue from the tip");
    }
  }

  function onPointerMove(e) {
    if (!drawing || mode !== "draw") return;
    e.preventDefault();
    const p = canvasPoint(e);
    const last = points[points.length - 1];
    if (!last) return;
    if (dist(p, last) < MIN_SEG) return;
    // Clamp inside canvas with margin
    const np = {
      x: Math.max(8, Math.min(W - 8, p.x)),
      y: Math.max(8, Math.min(H - 8, p.y)),
    };
    const L = level();
    // Reject if segment would enter a block
    if (L.blocks.some((b) => segIntersectRect(last, np, b))) {
      flash("Blocked by the core");
      return;
    }
    points.push(np);
    // Auto-finish if we reach goal while drawing
    if (nearPadTop(np, L.goal) || onPadSurface(np, L.goal)) {
      drawing = false;
      // Snap
      np.x = Math.max(L.goal.x, Math.min(L.goal.x + L.goal.w, np.x));
      np.y = L.goal.y;
      beginWalk();
    }
  }

  function onPointerUp(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    if (mode === "draw" && points.length > 1) {
      beginWalk();
    }
    updateDock();
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUp, { passive: false });
  canvas.addEventListener("lostpointercapture", onPointerUp, { passive: false });

  btn.start.addEventListener("click", () => {
    totalTime = 0;
    levelIndex = 0;
    resetStage();
  });
  btn.retry.addEventListener("click", () => {
    // Retry same drawn path? Simpler: redraw
    resetStage();
  });
  btn.redraw.addEventListener("click", () => resetStage());
  btn.next.addEventListener("click", () => {
    levelIndex = Math.min(LEVELS.length - 1, levelIndex + 1);
    resetStage();
  });
  btn.replay.addEventListener("click", () => resetStage());
  btn.again.addEventListener("click", () => {
    totalTime = 0;
    levelIndex = 0;
    resetStage();
  });
  btn.undo.addEventListener("click", () => {
    if (mode !== "draw" || points.length < 2) return;
    points.pop();
    updateDock();
  });
  btn.clear.addEventListener("click", () => {
    if (mode !== "draw") return;
    points = [];
    updateDock();
  });
  btn.restart.addEventListener("click", () => {
    if (mode === "intro") return;
    resetStage();
  });

  function update(dt) {
    hintPulse += dt;
    if (timing) stageTime += dt;
    setHud();

    if (mode === "walk" && !walker.falling) {
      walkLen += WALK_SPEED * dt;
      if (walkLen >= totalLen) {
        walkLen = totalLen;
        const L = level();
        const p = pointAt(walkLen);
        walker.x = p.x;
        walker.y = p.y;
        walker.angle = p.angle;
        if (onPadSurface(p, L.goal) || nearPadTop(p, L.goal)) {
          triggerClear();
        } else {
          triggerFail("Beam ended short of the goal");
        }
      } else {
        const p = pointAt(walkLen);
        walker.x = p.x;
        walker.y = p.y;
        walker.angle = p.angle;
        // Extreme overhang: if local slope is nearly vertical upward with no support — allow
        // Fall if beam intersects a block mid-walk (shouldn't)
        const L = level();
        if (L.blocks.some((b) => walker.x >= b.x && walker.x <= b.x + b.w && walker.y >= b.y && walker.y <= b.y + b.h)) {
          triggerFail("Hit the core");
        }
      }
    }

    if (walker.falling) {
      walker.vy += FALL_G * dt;
      walker.y += walker.vy * dt;
      walker.x += walker.vx * dt;
      walker.angle += dt * 4;
    }

    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#071018");
    g.addColorStop(0.55, "#0b1a2e");
    g.addColorStop(1, "#12243a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Distant skyline
    ctx.fillStyle = "#0a1524";
    for (let i = 0; i < 14; i++) {
      const bx = (i * 47 + 10) % W;
      const bh = 40 + ((i * 37) % 90);
      const bw = 28 + (i % 3) * 10;
      ctx.fillRect(bx, H - 80 - bh, bw, bh + 80);
    }

    // Soft stars
    ctx.fillStyle = "rgba(232,238,252,0.35)";
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97 + 13) % W;
      const sy = (i * 53 + 21) % (H * 0.45);
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Ground haze
    const haze = ctx.createLinearGradient(0, H - 120, 0, H);
    haze.addColorStop(0, "rgba(11,18,32,0)");
    haze.addColorStop(1, "rgba(8,14,24,0.9)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, H - 120, W, 120);
  }

  function drawPad(pad, label, color, glow) {
    // Pillar
    ctx.fillStyle = "#1a2438";
    ctx.fillRect(pad.x + pad.w * 0.35, pad.y, pad.w * 0.3, H - pad.y);
    // Deck
    ctx.fillStyle = color;
    roundRect(pad.x, pad.y - 6, pad.w, 14, 4);
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.25 + Math.sin(hintPulse * 3) * 0.08;
    roundRect(pad.x - 6, pad.y - 14, pad.w + 12, 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Label
    ctx.fillStyle = "#e8eefc";
    ctx.font = "700 12px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, pad.x + pad.w / 2, pad.y - 18);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBlocks(blocks) {
    for (const b of blocks) {
      ctx.fillStyle = "#152033";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "#2a3a55";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Window lights
      ctx.fillStyle = "rgba(240,180,41,0.35)";
      for (let y = b.y + 16; y < b.y + b.h - 20; y += 28) {
        for (let x = b.x + 14; x < b.x + b.w - 14; x += 22) {
          if (((x + y) / 11) % 3 < 2) ctx.fillRect(x, y, 10, 14);
        }
      }
      ctx.fillStyle = "#8b9bb8";
      ctx.font = "700 11px ui-rounded, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CORE", b.x + b.w / 2, b.y + 28);
    }
  }

  function drawBeam(pts, active) {
    if (pts.length < 2) {
      if (pts.length === 1) {
        ctx.fillStyle = "#9aa7bd";
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, BEAM_W / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Shadow
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = BEAM_W + 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x + 3, pts[0].y + 5);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 3, pts[i].y + 5);
    ctx.stroke();

    // Steel body
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#c5d0e0");
    grad.addColorStop(0.5, "#8b9bb0");
    grad.addColorStop(1, "#6a7a90");
    ctx.strokeStyle = grad;
    ctx.lineWidth = BEAM_W;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Center highlight
    ctx.strokeStyle = active ? "rgba(62,207,142,0.55)" : "rgba(232,238,252,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Rivets
    ctx.fillStyle = "#4a5568";
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i]);
      acc += d;
      if (acc > 28) {
        acc = 0;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawWalker(w) {
    ctx.save();
    ctx.translate(w.x, w.y - 10);
    ctx.rotate(w.falling ? w.angle : w.angle * 0.15);
    // Hard hat
    ctx.fillStyle = "#f0b429";
    ctx.beginPath();
    ctx.ellipse(0, -14, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-9, -14, 18, 4);
    // Body
    ctx.fillStyle = "#3ecf8e";
    roundRect(-7, -10, 14, 18, 4);
    ctx.fill();
    // Legs
    ctx.strokeStyle = "#e8eefc";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    const swing = Math.sin(walkLen * 0.12) * 6;
    ctx.beginPath();
    ctx.moveTo(-3, 8);
    ctx.lineTo(-3 - swing, 18);
    ctx.moveTo(3, 8);
    ctx.lineTo(3 + swing, 18);
    ctx.stroke();
    ctx.restore();
  }

  function drawMessage() {
    if (performance.now() > messageUntil || !message) return;
    ctx.fillStyle = "rgba(18,26,43,0.85)";
    roundRect(W * 0.12, 48, W * 0.76, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#e8eefc";
    ctx.font = "600 14px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, W / 2, 73);
  }

  function drawGuide() {
    if (mode !== "draw" || points.length > 0) return;
    const L = level();
    const a = 0.35 + Math.sin(hintPulse * 2.5) * 0.15;
    ctx.strokeStyle = `rgba(62,207,142,${a})`;
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L.start.x + L.start.w / 2, L.start.y);
    const midX = (L.start.x + L.start.w / 2 + L.goal.x + L.goal.w / 2) / 2;
    const midY = Math.min(L.start.y, L.goal.y) - 60;
    ctx.quadraticCurveTo(midX, midY, L.goal.x + L.goal.w / 2, L.goal.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function render() {
    drawSky();
    const L = level();
    drawBlocks(L.blocks);
    drawPad(L.start, "START", "#3ecf8e", "#3ecf8e");
    drawPad(L.goal, "GOAL", "#f0b429", "#f0b429");
    drawGuide();
    drawBeam(points, mode === "draw" || mode === "walk");

    if (mode === "draw" || mode === "walk" || mode === "fail" || mode === "clear" || mode === "done") {
      if (points.length || mode === "draw") {
        // idle walker on start before draw
        if (mode === "draw" && points.length === 0) {
          walker.x = L.start.x + L.start.w * 0.5;
          walker.y = L.start.y;
          walker.angle = 0;
        }
        if (mode !== "intro") drawWalker(walker);
      }
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    }

    // Stage name
    if (mode === "draw" || mode === "walk") {
      ctx.fillStyle = "rgba(139,155,184,0.9)";
      ctx.font = "600 13px ui-rounded, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(L.name, 16, 28);
    }

    drawMessage();
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(0.033, dt);
    if (mode !== "intro") update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // Size canvas CSS vs backing store already fixed; CSS stretches it.
  function fit() {
    // keep internal resolution; CSS handles display size
  }
  window.addEventListener("resize", fit);
  fit();
  showPanel("intro");
  setHud();
  requestAnimationFrame(frame);
})();
