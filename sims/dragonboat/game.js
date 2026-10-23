/**
 * Dragonboat Lab — UI state machine + 2D canvas scene
 * States: INTRO → EDIT → RUN → RESULT
 */
(function () {
  "use strict";

  const P = window.DragonPhysics;
  const W = 540; // logical canvas width
  const H = 640; // logical canvas height (portrait-ish stage)

  const S = {
    INTRO: "INTRO",
    EDIT: "EDIT",
    RUN: "RUN",
    RESULT: "RESULT",
  };

  let state = S.INTRO;
  let params = P.defaultParams();
  let sim = P.initialState();
  let lastResult = null;
  let raf = 0;
  let lastTs = 0;

  // Visual paddle trail (side-view path of blade tip during edit + run)
  let paddleTrail = [];

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function bind() {
    els.canvas = $("scene");
    els.ctx = els.canvas.getContext("2d");
    els.intro = $("panel-intro");
    els.result = $("panel-result");
    els.editDock = $("edit-dock");
    els.hud = $("hud");
    els.est = $("est-time");
    els.hudDist = $("hud-dist");
    els.hudSpeed = $("hud-speed");
    els.hudTime = $("hud-time");
    els.resTime = $("res-time");
    els.resAvg = $("res-avg");
    els.resPeak = $("res-peak");
    els.resNote = $("res-note");

    $("btn-start").addEventListener("click", () => setState(S.EDIT));
    $("btn-paddle").addEventListener("click", startRun);
    $("btn-reset-params").addEventListener("click", () => {
      params = P.defaultParams();
      syncSliders();
      updateEstimate();
      draw();
    });
    $("btn-again").addEventListener("click", () => setState(S.EDIT));
    $("btn-rerun").addEventListener("click", startRun);

    const map = [
      ["sl-length", "strokeLengthM", "val-length", (v) => v.toFixed(2) + " m"],
      ["sl-depth", "depthM", "val-depth", (v) => Math.round(v * 100) + " cm"],
      ["sl-angle", "angleDeg", "val-angle", (v) => Math.round(v) + "°"],
      ["sl-spm", "spm", "val-spm", (v) => Math.round(v) + " spm"],
      ["sl-effort", "effort", "val-effort", (v) => Math.round(v * 100) + "%"],
    ];
    map.forEach(([id, key, valId, fmt]) => {
      const input = $(id);
      const label = $(valId);
      input.addEventListener("input", () => {
        params[key] = parseFloat(input.value);
        label.textContent = fmt(params[key]);
        updateEstimate();
        draw();
      });
    });

    // HiDPI canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.canvas.width = W * dpr;
    els.canvas.height = H * dpr;
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    syncSliders();
    setState(S.INTRO);
    updateEstimate();
    draw();
  }

  function syncSliders() {
    $("sl-length").value = params.strokeLengthM;
    $("val-length").textContent = params.strokeLengthM.toFixed(2) + " m";
    $("sl-depth").value = params.depthM;
    $("val-depth").textContent = Math.round(params.depthM * 100) + " cm";
    $("sl-angle").value = params.angleDeg;
    $("val-angle").textContent = Math.round(params.angleDeg) + "°";
    $("sl-spm").value = params.spm;
    $("val-spm").textContent = Math.round(params.spm) + " spm";
    $("sl-effort").value = params.effort;
    $("val-effort").textContent = Math.round(params.effort * 100) + "%";
  }

  function setState(next) {
    state = next;
    els.intro.classList.toggle("active", state === S.INTRO);
    els.result.classList.toggle("active", state === S.RESULT);
    els.editDock.classList.toggle("active", state === S.EDIT);
    els.hud.classList.toggle("active", state === S.RUN);

    if (state !== S.RUN && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    draw();
  }

  function updateEstimate() {
    const r = P.simulate(params, { dt: 1 / 45, maxT: 90 });
    if (!r.finished) {
      els.est.textContent = "est. > 90 s / 100 m";
    } else {
      els.est.textContent =
        "est. " + r.time.toFixed(1) + " s · " + r.avgSpeed.toFixed(2) + " m/s";
    }
  }

  function startRun() {
    sim = P.initialState();
    paddleTrail = [];
    lastTs = 0;
    lastResult = null;
    setState(S.RUN);
    raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (state !== S.RUN) return;
    if (!lastTs) lastTs = ts;
    // Fixed physics step; catch up a little if frame hitch
    let frameDt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    const stepDt = 1 / 60;
    while (frameDt > 0 && !sim.finished) {
      const dt = Math.min(stepDt, frameDt);
      sim = P.step(sim, params, dt);
      samplePaddleTip(sim);
      frameDt -= dt;
    }

    els.hudDist.textContent = Math.min(sim.x, P.RACE_DISTANCE_M).toFixed(1) + " m";
    els.hudSpeed.textContent = sim.v.toFixed(2) + " m/s";
    els.hudTime.textContent = sim.t.toFixed(2) + " s";

    draw();

    if (sim.finished) {
      finishRun();
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  function finishRun() {
    const avg = sim.t > 0 ? P.RACE_DISTANCE_M / sim.t : 0;
    const thrustShare =
      sim.impulseThrust + sim.impulseDrag > 0
        ? sim.impulseThrust / (sim.impulseThrust + sim.impulseDrag)
        : 0;
    lastResult = {
      time: sim.t,
      avgSpeed: avg,
      peakSpeed: sim.peakV,
      thrustShare,
      angleEff: P.angleEfficiency(params.angleDeg),
      finished: true,
    };
    els.resTime.textContent = lastResult.time.toFixed(2);
    els.resAvg.textContent = lastResult.avgSpeed.toFixed(2);
    els.resPeak.textContent = lastResult.peakSpeed.toFixed(2);
    els.resNote.innerHTML =
      "<strong>What dominated:</strong> " +
      P.coachingNote(params, lastResult);
    setState(S.RESULT);
  }

  /** Record blade tip in world/scene space for a short trail. */
  function samplePaddleTip(s) {
    const pose = paddlePose(s);
    // Store world X so the trail stays in the water as the boat moves on.
    paddleTrail.push({ x: s.x + pose.bladeX, y: pose.bladeY, t: s.t });
    // keep ~1.2 s of trail
    while (paddleTrail.length && s.t - paddleTrail[0].t > 1.2) {
      paddleTrail.shift();
    }
  }

  /**
   * Side-view stick paddler + blade pose from stroke phase.
   * Boat local coords: origin at boat mid, +x forward (right on screen
   * before camera), +y up.
   */
  function paddlePose(s) {
    const kin = s.kin || P.strokeKinematics(params);
    const u = kin.cycleT > 0 ? s.phaseTime / kin.cycleT : 0; // 0..1
    const wf = kin.wf;
    // Shoulder / hip anchors in boat space
    const shoulderX = -0.15;
    const shoulderY = 0.95;
    const hipX = -0.05;
    const hipY = 0.45;

    // Stroke arc: water phase pulls blade aft (negative x), recovery returns
    const len = params.strokeLengthM;
    const depth = params.depthM;
    const ang = (params.angleDeg * Math.PI) / 180;

    let bladeX, bladeY, inWater;
    if (u < wf) {
      // Drive: catch (forward) → exit (aft)
      const p = u / wf; // 0..1
      const travel = len * (0.5 - p); // +len/2 → −len/2 relative to paddler
      bladeX = shoulderX + 0.35 + travel;
      bladeY = 0.08 - depth * (0.55 + 0.45 * Math.sin(Math.PI * p));
      inWater = true;
    } else {
      // Recovery: lift and swing forward
      const p = (u - wf) / (1 - wf);
      const travel = len * (-0.5 + p);
      bladeX = shoulderX + 0.35 + travel;
      bladeY = 0.15 + 0.35 * Math.sin(Math.PI * p);
      inWater = false;
    }

    // Shaft tilt from insert angle (visual)
    const topX = bladeX + Math.sin(ang) * 0.15;
    const topY = bladeY + Math.cos(ang) * (0.75 + depth * 0.2);

    return {
      shoulderX,
      shoulderY,
      hipX,
      hipY,
      bladeX,
      bladeY,
      topX,
      topY,
      handX: (bladeX + topX) * 0.5,
      handY: (bladeY + topY) * 0.5,
      inWater,
    };
  }

  // ---------- Drawing ----------

  function draw() {
    const ctx = els.ctx;
    ctx.clearRect(0, 0, W, H);

    // Camera follows boat in RUN/RESULT; fixed preview berth in EDIT/INTRO
    const isPreview = state === S.EDIT || state === S.INTRO;
    const boatX = isPreview ? 5 : sim.x || 0;
    const camX = boatX - 4.5; // meters of world shown behind bow bias

    drawSky(ctx);
    drawWater(ctx, camX);
    drawLaneMarkers(ctx, camX);
    drawFinish(ctx, camX);

    const drawSim = isPreview
      ? { x: boatX, v: 0, t: 0, phaseTime: previewPhase(), kin: P.strokeKinematics(params) }
      : sim;

    drawBoatAndPaddler(ctx, camX, drawSim);

    if (state === S.EDIT || state === S.INTRO) {
      drawStrokeGhost(ctx, camX, drawSim);
    } else {
      drawTrail(ctx, camX);
    }

    drawDistanceBar(ctx);
  }

  function previewPhase() {
    // Slow idle cycle so edit preview animates lightly
    return ((performance.now() / 1000) % (60 / params.spm)) ;
  }

  function worldToScreen(camX, wx, wy) {
    // Visible world width ~14 m across canvas
    const scale = W / 14;
    const waterY = H * 0.58;
    const sx = (wx - camX) * scale;
    const sy = waterY - wy * scale;
    return { x: sx, y: sy, scale, waterY };
  }

  function drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.58);
    g.addColorStop(0, "#0a1628");
    g.addColorStop(1, "#14304a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.58);
  }

  function drawWater(ctx, camX) {
    const waterY = H * 0.58;
    const g = ctx.createLinearGradient(0, waterY, 0, H);
    g.addColorStop(0, "#1a5a7a");
    g.addColorStop(0.4, "#0f3a55");
    g.addColorStop(1, "#0a2438");
    ctx.fillStyle = g;
    ctx.fillRect(0, waterY, W, H - waterY);

    // Simple wave sparkle lines scrolling with camera
    ctx.strokeStyle = "rgba(180, 220, 255, 0.12)";
    ctx.lineWidth = 1;
    const scale = W / 14;
    for (let i = 0; i < 18; i++) {
      const wx = Math.floor(camX) + i * 0.9;
      const sx = (wx - camX) * scale + ((wx * 17) % 7);
      const sy = waterY + 12 + ((i * 37) % 80);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + 20, sy + 3, sx + 40, sy);
      ctx.stroke();
    }
  }

  function drawLaneMarkers(ctx, camX) {
    const scale = W / 14;
    const waterY = H * 0.58;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "600 11px system-ui, sans-serif";
    for (let m = 0; m <= P.RACE_DISTANCE_M; m += 10) {
      const sx = (m - camX) * scale;
      if (sx < -20 || sx > W + 20) continue;
      ctx.fillRect(sx, waterY - 6, 2, 12);
      if (m % 25 === 0) {
        ctx.fillStyle = "rgba(232,238,252,0.55)";
        ctx.fillText(m + "m", sx + 4, waterY - 10);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
      }
    }
  }

  function drawFinish(ctx, camX) {
    const scale = W / 14;
    const sx = (P.RACE_DISTANCE_M - camX) * scale;
    if (sx < -10 || sx > W + 10) return;
    ctx.strokeStyle = "rgba(240, 180, 41, 0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(sx, H * 0.2);
    ctx.lineTo(sx, H * 0.58);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0b429";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("FINISH", sx + 6, H * 0.22);
  }

  function drawBoatAndPaddler(ctx, camX, s) {
    const pose = paddlePose(s);
    const mid = worldToScreen(camX, s.x, 0);
    const sc = mid.scale;

    // Hull
    ctx.save();
    ctx.translate(mid.x, mid.waterY);
    ctx.fillStyle = "#c47a3a";
    ctx.strokeStyle = "#8a4e22";
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Pointy bow to the right (forward)
    ctx.moveTo(1.8 * sc, -0.05 * sc);
    ctx.quadraticCurveTo(1.2 * sc, -0.28 * sc, 0.2 * sc, -0.32 * sc);
    ctx.lineTo(-1.5 * sc, -0.28 * sc);
    ctx.quadraticCurveTo(-1.9 * sc, -0.1 * sc, -1.7 * sc, 0.05 * sc);
    ctx.lineTo(1.5 * sc, 0.08 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Deck stripe
    ctx.strokeStyle = "rgba(255,220,160,0.35)";
    ctx.beginPath();
    ctx.moveTo(-1.4 * sc, -0.18 * sc);
    ctx.lineTo(1.3 * sc, -0.18 * sc);
    ctx.stroke();

    // Stick paddler
    const sh = worldLocal(pose.shoulderX, pose.shoulderY, sc);
    const hip = worldLocal(pose.hipX, pose.hipY, sc);
    const head = worldLocal(pose.shoulderX + 0.02, pose.shoulderY + 0.28, sc);

    ctx.strokeStyle = "#e8eefc";
    ctx.fillStyle = "#e8eefc";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // body
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hip.x, hip.y);
    ctx.stroke();
    // head
    ctx.beginPath();
    ctx.arc(head.x, head.y, 0.12 * sc, 0, Math.PI * 2);
    ctx.fill();
    // legs tucked
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(hip.x + 0.25 * sc, hip.y + 0.2 * sc);
    ctx.lineTo(hip.x + 0.45 * sc, hip.y + 0.05 * sc);
    ctx.stroke();

    // paddle shaft + blade
    const blade = worldLocal(pose.bladeX, pose.bladeY, sc);
    const top = worldLocal(pose.topX, pose.topY, sc);
    const hand = worldLocal(pose.handX, pose.handY, sc);

    // arm to paddle
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();

    ctx.strokeStyle = "#d8c4a0";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(blade.x, blade.y);
    ctx.stroke();

    // blade face
    ctx.fillStyle = pose.inWater ? "#3ecf8e" : "#a0b0c8";
    ctx.save();
    ctx.translate(blade.x, blade.y);
    const ang = (params.angleDeg * Math.PI) / 180;
    ctx.rotate(ang);
    ctx.fillRect(-0.06 * sc, -0.02 * sc, 0.12 * sc, (0.22 + params.depthM * 0.15) * sc);
    ctx.restore();

    // splash when in water & moving
    if (pose.inWater && (state === S.RUN || state === S.EDIT)) {
      ctx.fillStyle = "rgba(200, 240, 255, 0.35)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(
          blade.x - (4 + i * 5),
          blade.y - 2 + (i % 2) * 3,
          2 + (i % 3),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function worldLocal(bx, by, sc) {
    return { x: bx * sc, y: -by * sc };
  }

  function drawTrail(ctx, camX) {
    if (paddleTrail.length < 2) return;
    const scale = W / 14;
    const waterY = H * 0.58;
    ctx.beginPath();
    for (let i = 0; i < paddleTrail.length; i++) {
      const p = paddleTrail[i];
      const sx = (p.x - camX) * scale;
      const sy = waterY - p.y * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = "rgba(62, 207, 142, 0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawStrokeGhost(ctx, camX, s) {
    // Ghost arc of blade path for current params (edit preview)
    const kin = P.strokeKinematics(params);
    const scale = W / 14;
    const waterY = H * 0.58;
    const boatX = s.x;

    ctx.beginPath();
    const samples = 24;
    for (let i = 0; i <= samples; i++) {
      const fake = {
        phaseTime: (i / samples) * kin.cycleT,
        kin,
      };
      const pose = paddlePose(fake);
      const sx = (boatX + pose.bladeX - camX) * scale;
      const sy = waterY - pose.bladeY * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = "rgba(62, 207, 142, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Water line label
    ctx.fillStyle = "rgba(139, 155, 184, 0.8)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText("paddle path (side view)", 14, waterY + 22);
  }

  function drawDistanceBar(ctx) {
    if (state !== S.RUN && state !== S.RESULT) return;
    const x = Math.min(sim.x, P.RACE_DISTANCE_M);
    const pct = x / P.RACE_DISTANCE_M;
    const barW = W - 40;
    const bx = 20;
    const by = H - 22;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(bx, by, barW, 8);
    ctx.fillStyle = "#3ecf8e";
    ctx.fillRect(bx, by, barW * pct, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(bx, by, barW, 8);
  }

  // Idle animation in EDIT/INTRO so paddle path breathes
  function idle() {
    if (state === S.EDIT || state === S.INTRO) draw();
    requestAnimationFrame(idle);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    requestAnimationFrame(idle);
  });
})();
