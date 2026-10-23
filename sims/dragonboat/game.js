/**
 * Dragonboat Lab v2 — UI state machine + 2D canvas scene
 * States: INTRO → EDIT → RUN (pausable) → RESULT
 */
(function () {
  "use strict";

  const P = window.DragonPhysics;
  let W = 540;
  let H = 640;

  const S = {
    INTRO: "INTRO",
    EDIT: "EDIT",
    RUN: "RUN",
    RESULT: "RESULT",
  };

  let state = S.INTRO;
  let paused = false;
  let params = P.defaultParams();
  let sim = P.initialState();
  let lastResult = null;
  let raf = 0;
  let lastTs = 0;
  let paddleTrail = [];
  /** @type {{t:number,v:number,x:number}[]} */
  let speedHistory = [];
  let graphDpr = 1;

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function bind() {
    els.canvas = $("scene");
    els.ctx = els.canvas.getContext("2d");
    els.graph = $("graph");
    els.gctx = els.graph.getContext("2d");
    els.graphWrap = $("graph-wrap");
    els.intro = $("panel-intro");
    els.result = $("panel-result");
    els.editDock = $("edit-dock");
    els.hud = $("hud");
    els.runControls = $("run-controls");
    els.est = $("est-time");
    els.hudDist = $("hud-dist");
    els.hudSpeed = $("hud-speed");
    els.hudTime = $("hud-time");
    els.resTime = $("res-time");
    els.resAvg = $("res-avg");
    els.resPeak = $("res-peak");
    els.resSync = $("res-sync");
    els.resNote = $("res-note");
    els.resSyncNote = $("res-sync-note");
    els.btnPause = $("btn-pause");

    $("btn-start").addEventListener("click", function () {
      setState(S.EDIT);
    });
    $("btn-paddle").addEventListener("click", startRun);
    $("btn-reset-params").addEventListener("click", function () {
      params = P.defaultParams();
      syncSliders();
      updateEstimate();
      draw();
    });
    $("btn-again").addEventListener("click", function () {
      setState(S.EDIT);
    });
    $("btn-rerun").addEventListener("click", startRun);
    $("btn-pause").addEventListener("click", togglePause);
    $("btn-restart").addEventListener("click", function () {
      // Back to customization (keep current slider values)
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      paused = false;
      sim = P.initialState();
      paddleTrail = [];
      speedHistory = [];
      lastTs = 0;
      setState(S.EDIT);
    });

    const map = [
      ["sl-length", "strokeLengthM", "val-length", function (v) { return v.toFixed(2) + " m"; }],
      ["sl-depth", "depthM", "val-depth", function (v) { return Math.round(v * 100) + " cm"; }],
      ["sl-angle", "angleDeg", "val-angle", function (v) { return Math.round(v) + "°"; }],
      ["sl-spm", "spm", "val-spm", function (v) { return Math.round(v) + " spm"; }],
      ["sl-effort", "effort", "val-effort", function (v) { return Math.round(v * 100) + "%"; }],
      ["sl-crew", "crewSize", "val-crew", function (v) { return String(Math.round(v)); }],
      ["sl-sync", "syncPct", "val-sync", function (v) { return Math.round(v) + "%"; }],
      ["sl-pace", "paceVariance", "val-pace", function (v) { return Math.round(v * 100) + "%"; }, true],
    ];
    map.forEach(function (row) {
      const id = row[0];
      const key = row[1];
      const valId = row[2];
      const fmt = row[3];
      const isPace = row[4];
      const input = $(id);
      const label = $(valId);
      input.addEventListener("input", function () {
        let v = parseFloat(input.value);
        if (isPace) v = v / 100;
        if (key === "crewSize") v = Math.round(v);
        params[key] = v;
        label.textContent = fmt(isPace ? params[key] : params[key]);
        if (isPace) label.textContent = Math.round(params.paceVariance * 100) + "%";
        updateEstimate();
        draw();
      });
    });

    els.stageWrap = $("stage-wrap");
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", function () {
      setTimeout(onResize, 80);
    });
    if (window.ResizeObserver && els.stageWrap) {
      new ResizeObserver(function () {
        onResize();
      }).observe(els.stageWrap);
    }
    onResize();

    syncSliders();
    setState(S.EDIT);
    updateEstimate();
    draw();
  }

  function onResize() {
    resizeCanvas();
    resizeGraph();
  }

  function resizeCanvas() {
    const wrap = els.stageWrap || $("stage-wrap");
    if (!wrap || !els.canvas) return;
    const rect = wrap.getBoundingClientRect();
    const pad = 16; // CSS inset 8px * 2
    let cssW = Math.floor(rect.width - pad);
    let cssH = Math.floor(rect.height - pad);
    if (!(cssW > 40)) cssW = Math.floor(Math.min(window.innerWidth, 960) - 24);
    if (!(cssH > 80)) {
      const dock = els.editDock && els.editDock.classList.contains("active") ? 0.38 : 0.12;
      cssH = Math.floor((window.visualViewport ? window.visualViewport.height : window.innerHeight) * (1 - dock) - 72);
    }
    cssW = Math.max(200, cssW);
    cssH = Math.max(160, cssH);
    W = cssW;
    H = cssH;
    // iOS Safari: absolute + width/height:auto often paints a 0×0 canvas. Set both CSS and buffer.
    els.canvas.style.width = cssW + "px";
    els.canvas.style.height = cssH + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (els.canvas.width !== bw || els.canvas.height !== bh) {
      els.canvas.width = bw;
      els.canvas.height = bh;
    }
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function resizeGraph() {
    if (!els.graph || !els.graphWrap) return;
    const wrap = els.stageWrap || $("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    const cssW = Math.max(280, Math.floor(rect.width) || W);
    const cssH = Math.min(120, Math.max(72, Math.floor(rect.height * 0.18)));
    els.graph.style.width = cssW + "px";
    els.graph.style.height = cssH + "px";
    graphDpr = Math.min(window.devicePixelRatio || 1, 2.5);
    els.graph.width = Math.round(cssW * graphDpr);
    els.graph.height = Math.round(cssH * graphDpr);
    els.gctx.setTransform(graphDpr, 0, 0, graphDpr, 0, 0);
    drawGraph();
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
    $("sl-crew").value = params.crewSize;
    $("val-crew").textContent = String(params.crewSize);
    $("sl-sync").value = params.syncPct;
    $("val-sync").textContent = Math.round(params.syncPct) + "%";
    $("sl-pace").value = Math.round(params.paceVariance * 100);
    $("val-pace").textContent = Math.round(params.paceVariance * 100) + "%";
  }

  function setState(next) {
    state = next;
    if (next !== S.RUN) paused = false;
    els.intro.classList.toggle("active", state === S.INTRO);
    els.result.classList.toggle("active", state === S.RESULT);
    els.editDock.classList.toggle("active", state === S.EDIT);
    els.hud.classList.toggle("active", state === S.RUN);
    els.runControls.classList.toggle("active", state === S.RUN);
    els.graphWrap.classList.toggle("active", state === S.RUN || state === S.RESULT);
    els.graphWrap.setAttribute("aria-hidden", state === S.RUN || state === S.RESULT ? "false" : "true");
    updatePauseLabel();

    if (state !== S.RUN && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    // Re-measure after dock show/hide
    requestAnimationFrame(function () {
      onResize();
      draw();
      drawGraph();
    });
  }

  function updatePauseLabel() {
    if (!els.btnPause) return;
    els.btnPause.textContent = paused ? "Resume" : "Pause";
  }

  function togglePause() {
    if (state !== S.RUN) return;
    paused = !paused;
    updatePauseLabel();
    if (paused) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      lastTs = 0;
      draw();
      drawGraph();
    } else {
      lastTs = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  function updateEstimate() {
    const r = P.simulate(params, { dt: 1 / 45, maxT: 90 });
    if (!r.finished) {
      els.est.textContent = "est. > 90 s / 100 m";
    } else {
      els.est.textContent =
        "est. " +
        r.time.toFixed(1) +
        " s · " +
        r.avgSpeed.toFixed(2) +
        " m/s · crew " +
        params.crewSize +
        " · sync " +
        Math.round(params.syncPct) +
        "%";
    }
  }

  function startRun() {
    sim = P.initialState();
    paddleTrail = [];
    speedHistory = [];
    lastTs = 0;
    lastResult = null;
    paused = false;
    setState(S.RUN);
    raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    if (state !== S.RUN || paused) return;
    if (!lastTs) lastTs = ts;
    let frameDt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    const stepDt = 1 / 60;
    while (frameDt > 0 && !sim.finished) {
      const dt = Math.min(stepDt, frameDt);
      sim = P.step(sim, params, dt);
      samplePaddleTip(sim);
      // record ~20 Hz for graph
      if (
        speedHistory.length === 0 ||
        sim.t - speedHistory[speedHistory.length - 1].t >= 0.05
      ) {
        speedHistory.push({ t: sim.t, v: sim.v, x: sim.x });
      }
      frameDt -= dt;
    }

    els.hudDist.textContent = Math.min(sim.x, P.RACE_DISTANCE_M).toFixed(1) + " m";
    els.hudSpeed.textContent = sim.v.toFixed(2) + " m/s";
    els.hudTime.textContent = sim.t.toFixed(2) + " s";

    draw();
    drawGraph();

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
      thrustShare: thrustShare,
      angleEff: P.angleEfficiency(params.angleDeg),
      kin: P.strokeKinematics(params),
      finished: true,
    };
    els.resTime.textContent = lastResult.time.toFixed(2);
    els.resAvg.textContent = lastResult.avgSpeed.toFixed(2);
    els.resPeak.textContent = lastResult.peakSpeed.toFixed(2);
    els.resSync.textContent = String(Math.round(params.syncPct));
    els.resSyncNote.innerHTML =
      "<strong>Sync:</strong> " + P.syncNote(params);
    els.resNote.innerHTML =
      "<strong>Coaching:</strong> " + P.coachingNote(params, lastResult);
    setState(S.RESULT);
    drawGraph();
  }

  function samplePaddleTip(s) {
    const pose = paddlePose(s, 0);
    paddleTrail.push({ x: s.x + pose.bladeX, y: pose.bladeY, t: s.t });
    while (paddleTrail.length && s.t - paddleTrail[0].t > 1.2) {
      paddleTrail.shift();
    }
  }

  /**
   * Side-view stick paddler + blade. paddlerIndex shifts seat along the boat
   * and applies sync phase offset for animation.
   */
  function paddlePose(s, paddlerIndex) {
    const idx = paddlerIndex || 0;
    const kin = s.kin || P.strokeKinematics(params);
    const n = params.crewSize;
    const offset = P.paddlerPhaseOffset(idx, n, params.syncPct);
    // Per-paddler effective cycle from lead phaseTime
    const spm = params.spm; // visual uses mean SPM; physics has variance
    const cycleT = 60 / spm;
    const phaseTime = s.phaseTime || 0;
    const u = cycleT > 0 ? (((phaseTime / cycleT + offset) % 1) + 1) % 1 : 0;
    const ph = kin.phases || P.phaseFractions(spm);
    const stage = P.phaseAt(u, ph);

    // Seat spacing along boat (bow = +x). Spread crew across ~3.2 m of deck.
    const seatSpan = 3.2;
    const seatX =
      n <= 1 ? 0 : ((idx / (n - 1)) - 0.5) * seatSpan;

    const shoulderX = seatX - 0.05;
    const shoulderY = 0.95;
    const hipX = seatX + 0.05;
    const hipY = 0.45;

    const len = params.strokeLengthM;
    const depth = params.depthM;
    const ang = (params.angleDeg * Math.PI) / 180;

    // Progress along water path for blade travel
    let waterProgress = 0; // 0 catch → 1 exit
    let inWater = false;
    let airProgress = 0;

    if (stage.name === "reach") {
      airProgress = stage.local;
      inWater = false;
    } else if (stage.name === "catch") {
      waterProgress = 0.08 * stage.local;
      inWater = true;
    } else if (stage.name === "drive") {
      waterProgress = 0.08 + 0.72 * stage.local;
      inWater = true;
    } else if (stage.name === "exit") {
      waterProgress = 0.8 + 0.2 * stage.local;
      inWater = true;
    } else {
      // recovery: return forward above water
      airProgress = stage.local;
      inWater = false;
    }

    let bladeX;
    let bladeY;
    if (inWater) {
      const travel = len * (0.5 - waterProgress);
      bladeX = shoulderX + 0.35 + travel;
      const bury =
        stage.name === "catch"
          ? depth * (0.4 + 0.6 * stage.local)
          : stage.name === "exit"
            ? depth * (1 - 0.65 * stage.local)
            : depth;
      bladeY = 0.06 - bury * (0.55 + 0.45 * Math.sin(Math.PI * waterProgress));
    } else if (stage.name === "reach") {
      // swing forward toward catch
      const travel = len * (-0.15 + 0.65 * airProgress);
      bladeX = shoulderX + 0.35 + travel;
      bladeY = 0.2 + 0.25 * (1 - airProgress);
    } else {
      // recovery aft → forward
      const travel = len * (-0.5 + airProgress);
      bladeX = shoulderX + 0.35 + travel;
      bladeY = 0.15 + 0.35 * Math.sin(Math.PI * airProgress);
    }

    // Shaft tilt: at catch use insert angle; through drive ease toward vertical
    let tilt = ang;
    if (stage.name === "drive") tilt = ang * (1 - 0.75 * stage.local);
    else if (stage.name === "exit") tilt = ang * 0.15;
    else if (stage.name === "recovery" || stage.name === "reach") tilt = ang * 0.5;

    const topX = bladeX + Math.sin(tilt) * 0.15;
    const topY = bladeY + Math.cos(tilt) * (0.75 + depth * 0.2);

    return {
      seatX: seatX,
      shoulderX: shoulderX,
      shoulderY: shoulderY,
      hipX: hipX,
      hipY: hipY,
      bladeX: bladeX,
      bladeY: bladeY,
      topX: topX,
      topY: topY,
      handX: (bladeX + topX) * 0.5,
      handY: (bladeY + topY) * 0.5,
      inWater: inWater,
      tilt: tilt,
      stage: stage.name,
    };
  }

  // ---------- Drawing ----------

  function draw() {
    if (!els.ctx) return;
    const ctx = els.ctx;
    ctx.clearRect(0, 0, W, H);

    const isPreview = state === S.EDIT || state === S.INTRO;
    const boatX = isPreview ? 5 : sim.x || 0;
    const camX = boatX - 4.5;

    drawSky(ctx);
    drawWater(ctx, camX);
    drawLaneMarkers(ctx, camX);
    drawFinish(ctx, camX);

    const drawSim = isPreview
      ? {
          x: boatX,
          v: 0,
          t: 0,
          phaseTime: previewPhase(),
          kin: P.strokeKinematics(params),
        }
      : sim;

    drawBoatAndCrew(ctx, camX, drawSim);

    if (state === S.EDIT || state === S.INTRO) {
      drawStrokeGhost(ctx, camX, drawSim);
    } else {
      drawTrail(ctx, camX);
    }

    drawDistanceBar(ctx);
    drawSpeedOnCanvas(ctx);

    if (paused && state === S.RUN) {
      ctx.fillStyle = "rgba(7,12,22,0.45)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e8eefc";
      ctx.font = "700 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", W / 2, H * 0.42);
      ctx.textAlign = "start";
    }
  }

  function drawSpeedOnCanvas(ctx) {
    const isPreview = state === S.EDIT || state === S.INTRO;
    const v = isPreview ? 0 : sim.v || 0;
    const label = v.toFixed(2) + " m/s";
    const pad = 12;
    const boxH = 44;
    ctx.save();
    ctx.font = "700 22px system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    const boxW = Math.max(118, tw + 28);
    const x = W - boxW - pad;
    const y = pad;
    ctx.fillStyle = "rgba(7, 16, 28, 0.72)";
    ctx.strokeStyle = "rgba(62, 207, 142, 0.45)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(139, 155, 184, 0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("SPEED", x + 12, y + 16);
    ctx.fillStyle = "#3ecf8e";
    ctx.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, x + 12, y + 36);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function previewPhase() {
    return (performance.now() / 1000) % (60 / params.spm);
  }

  function worldToScreen(camX, wx, wy) {
    const scale = W / 14;
    const waterY = H * 0.55;
    const sx = (wx - camX) * scale;
    const sy = waterY - wy * scale;
    return { x: sx, y: sy, scale: scale, waterY: waterY };
  }

  function drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, "#0a1628");
    g.addColorStop(1, "#14304a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.55);
  }

  function drawWater(ctx, camX) {
    const waterY = H * 0.55;
    const g = ctx.createLinearGradient(0, waterY, 0, H);
    g.addColorStop(0, "#1a5a7a");
    g.addColorStop(0.4, "#0f3a55");
    g.addColorStop(1, "#0a2438");
    ctx.fillStyle = g;
    ctx.fillRect(0, waterY, W, H - waterY);

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
    const waterY = H * 0.55;
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
    ctx.moveTo(sx, H * 0.18);
    ctx.lineTo(sx, H * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0b429";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText("FINISH", sx + 6, H * 0.2);
  }

  function drawBoatAndCrew(ctx, camX, s) {
    const mid = worldToScreen(camX, s.x, 0);
    const sc = mid.scale;
    const n = params.crewSize;

    // Longer hull for bigger crews (visual only)
    const halfLen = 1.6 + Math.min(n, 20) * 0.06;

    ctx.save();
    ctx.translate(mid.x, mid.waterY);
    ctx.fillStyle = "#c47a3a";
    ctx.strokeStyle = "#8a4e22";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(halfLen * sc, -0.05 * sc);
    ctx.quadraticCurveTo((halfLen - 0.5) * sc, -0.28 * sc, 0.2 * sc, -0.32 * sc);
    ctx.lineTo(-halfLen * 0.85 * sc, -0.28 * sc);
    ctx.quadraticCurveTo(-halfLen * sc, -0.1 * sc, (-halfLen + 0.15) * sc, 0.05 * sc);
    ctx.lineTo((halfLen - 0.3) * sc, 0.08 * sc);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,220,160,0.35)";
    ctx.beginPath();
    ctx.moveTo(-halfLen * 0.75 * sc, -0.18 * sc);
    ctx.lineTo((halfLen - 0.4) * sc, -0.18 * sc);
    ctx.stroke();

    // Draw a subset of paddlers for clarity (max ~10 visible sticks)
    const maxDraw = 10;
    const step = n <= maxDraw ? 1 : Math.ceil(n / maxDraw);
    for (let i = 0; i < n; i += step) {
      drawOnePaddler(ctx, s, i, sc);
    }
    // Always draw stern-most (index 0) and bow-most for sync visual
    if (step > 1) {
      drawOnePaddler(ctx, s, 0, sc);
      drawOnePaddler(ctx, s, n - 1, sc);
    }

    ctx.restore();
  }

  function drawOnePaddler(ctx, s, idx, sc) {
    const pose = paddlePose(s, idx);
    const sh = worldLocal(pose.shoulderX, pose.shoulderY, sc);
    const hip = worldLocal(pose.hipX, pose.hipY, sc);
    const head = worldLocal(pose.shoulderX + 0.02, pose.shoulderY + 0.28, sc);

    ctx.strokeStyle = "#e8eefc";
    ctx.fillStyle = "#e8eefc";
    ctx.lineWidth = idx === 0 ? 3 : 2;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hip.x, hip.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(head.x, head.y, 0.1 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(hip.x + 0.22 * sc, hip.y + 0.18 * sc);
    ctx.lineTo(hip.x + 0.4 * sc, hip.y + 0.04 * sc);
    ctx.stroke();

    const blade = worldLocal(pose.bladeX, pose.bladeY, sc);
    const top = worldLocal(pose.topX, pose.topY, sc);
    const hand = worldLocal(pose.handX, pose.handY, sc);

    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();

    ctx.strokeStyle = "#d8c4a0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(blade.x, blade.y);
    ctx.stroke();

    ctx.fillStyle = pose.inWater ? "#3ecf8e" : "#a0b0c8";
    ctx.save();
    ctx.translate(blade.x, blade.y);
    ctx.rotate(pose.tilt || 0);
    ctx.fillRect(
      -0.05 * sc,
      -0.02 * sc,
      0.1 * sc,
      (0.2 + params.depthM * 0.12) * sc
    );
    ctx.restore();

    if (pose.inWater && (state === S.RUN || state === S.EDIT) && idx === 0) {
      ctx.fillStyle = "rgba(200, 240, 255, 0.35)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(blade.x - (4 + i * 5), blade.y - 2 + (i % 2) * 3, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function worldLocal(bx, by, sc) {
    return { x: bx * sc, y: -by * sc };
  }

  function drawTrail(ctx, camX) {
    if (paddleTrail.length < 2) return;
    const scale = W / 14;
    const waterY = H * 0.55;
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
    const kin = P.strokeKinematics(params);
    const scale = W / 14;
    const waterY = H * 0.55;
    const boatX = s.x;

    ctx.beginPath();
    const samples = 28;
    for (let i = 0; i <= samples; i++) {
      const fake = {
        phaseTime: (i / samples) * kin.cycleT,
        kin: kin,
      };
      const pose = paddlePose(fake, 0);
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

    ctx.fillStyle = "rgba(139, 155, 184, 0.8)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText(
      "catch " + Math.round(params.angleDeg) + "° · crew " + params.crewSize + " · sync " + Math.round(params.syncPct) + "%",
      14,
      waterY + 22
    );
  }

  function drawDistanceBar(ctx) {
    if (state !== S.RUN && state !== S.RESULT) return;
    const x = Math.min(sim.x, P.RACE_DISTANCE_M);
    const pct = x / P.RACE_DISTANCE_M;
    const barW = W - 40;
    const bx = 20;
    const by = H - 18;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(bx, by, barW, 8);
    ctx.fillStyle = "#3ecf8e";
    ctx.fillRect(bx, by, barW * pct, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(bx, by, barW, 8);
  }

  /** Live speed + pace (s/100m) graph under / overlaid on stage. */
  function drawGraph() {
    if (!els.gctx || !els.graph) return;
    const ctx = els.gctx;
    const cssW = els.graph.clientWidth || W;
    const cssH = els.graph.clientHeight || 90;
    ctx.clearRect(0, 0, cssW, cssH);

    if (state !== S.RUN && state !== S.RESULT) return;

    // Background
    ctx.fillStyle = "rgba(7, 16, 28, 0.82)";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = "rgba(36, 48, 73, 0.95)";
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

    const padL = 36;
    const padR = 48;
    const padT = 16;
    const padB = 16;
    const plotW = cssW - padL - padR;
    const plotH = cssH - padT - padB;

    const hist = speedHistory;
    const tMax = Math.max(8, hist.length ? hist[hist.length - 1].t : 8);
    let vMax = 4;
    for (let i = 0; i < hist.length; i++) {
      if (hist[i].v > vMax) vMax = hist[i].v;
    }
    vMax = Math.max(4, vMax * 1.15);

    // Grid
    ctx.strokeStyle = "rgba(139,155,184,0.15)";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 2; g++) {
      const y = padT + (plotH * g) / 2;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    // Speed polyline
    if (hist.length >= 2) {
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const px = padL + (hist[i].t / tMax) * plotW;
        const py = padT + plotH - (hist[i].v / vMax) * plotH;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "#3ecf8e";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pace as s/100m = 100/v — secondary line (amber), only when v > 0.3
      ctx.beginPath();
      let started = false;
      const paceMin = 100 / vMax; // fastest possible on this scale ~ low s
      const paceMax = 80; // slow end of scale
      for (let i = 0; i < hist.length; i++) {
        const v = hist[i].v;
        if (v < 0.35) {
          started = false;
          continue;
        }
        const pace = 100 / v;
        const pn = (pace - paceMin) / (paceMax - paceMin);
        const py = padT + clamp01(pn) * plotH;
        const px = padL + (hist[i].t / tMax) * plotW;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.strokeStyle = "rgba(240, 180, 41, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = "rgba(139,155,184,0.95)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText("SPEED", padL, 12);
    ctx.fillStyle = "#3ecf8e";
    ctx.fillText("m/s", padL + 42, 12);
    ctx.fillStyle = "#f0b429";
    ctx.fillText("pace s/100m", padL + 72, 12);

    const vNow = hist.length ? hist[hist.length - 1].v : 0;
    const paceNow = vNow > 0.35 ? (100 / vNow).toFixed(1) : "—";
    ctx.fillStyle = "#e8eefc";
    ctx.font = "700 11px ui-monospace, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.fillText(vNow.toFixed(2) + " m/s", cssW - 8, 12);
    ctx.fillStyle = "#f0b429";
    ctx.fillText(paceNow + " s/100m", cssW - 8, cssH - 6);
    ctx.textAlign = "start";

    ctx.fillStyle = "rgba(139,155,184,0.7)";
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.fillText("0", padL - 14, padT + plotH + 3);
    ctx.fillText(vMax.toFixed(1), padL - 28, padT + 8);
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function idle() {
    if (state === S.EDIT || state === S.INTRO) draw();
    requestAnimationFrame(idle);
  }

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    requestAnimationFrame(idle);
  });
})();
