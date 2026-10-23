/**
 * Dragonboat Lab v2 — research-backed toy propulsion model
 * ========================================================
 * NOT CFD. Goal: coach-aligned stroke phases + multi-paddler sync so
 * slider extremes clearly change 100 m time. Formulas an engineer can retune.
 *
 * Coaching sources (toy encoding, not a paper replica)
 * ----------------------------------------------------
 * - London Dragon Boat Club / common UK coaching: bury the blade fully
 *   before hard pull; exit by the hip; avoid dragging a negative blade.
 * - Oyster Point Dragons: catch near ~45° forward of vertical, then pull
 *   toward vertical; exit around mid-thigh.
 * - Dragon Boat Net / recreational biomechanics write-ups: force peaks
 *   when the blade is immersed and near vertical during the drive.
 * - Sync literature / coaching lore: simultaneous force → clean glide;
 *   "caterpillaring" (out-of-phase paddlers) chops the force curve and
 *   hurts average speed even when each stroke looks fine in isolation.
 * - ISBS-style rate findings (toy): higher SPM shortens the water phase
 *   relative to the cycle (higher drive:total urgency, shorter reach).
 *
 * Stroke phases (fraction of cycle, rate-dependent)
 * -------------------------------------------------
 *   reach → catch → pull/drive → exit → recovery
 * Insert angle UI is 0–45° only:
 *   0°  = paddle perpendicular to the water (vertical)
 *   45° = positive forward catch (blade tip toward the bow)
 * Negative catch angles are not offered. A late exit that would push the
 * blade past vertical into a "negative" orientation applies a drag penalty.
 *
 * Multi-paddler (2D side view only)
 * ---------------------------------
 * Crew fixed at 5 seats (stern → bow). Each seat has a skill
 * (beginner / amateur / advanced) that scales effort, timing lag,
 * effective depth, and SPM. Instantaneous thrust = sum over seats.
 * Global sync still adds caterpillar jitter. No L/R sides.
 *
 * Integration: semi-implicit Euler, fixed dt (usually 1/60 s).
 */

(function (global) {
  "use strict";

  const RACE_DISTANCE_M = 100;

  /** Tunable world constants — tweak if results feel flat or extreme. */
  const CFG = {
    // Hull + empty boat mass; paddlers add massPaddlerKg * crewSize
    boatMassKg: 250,
    massPaddlerKg: 75,

    // Hull quadratic drag (N / (m/s)²). Scales gently with crew (wider load).
    hullDragKBase: 7.5,
    hullDragKPerPaddler: 0.18,

    rho: 1000,
    bladeCd: 1.45,
    bladeWidthM: 0.18,

    // Depth soft-cap (m)
    depthScaleM: 0.28,
    depthUsefulMaxM: 0.55,

    // Catch-angle efficiency: peaks near a forward ~38° catch (coach 45°
    // bury), still good near vertical drive (~10–20°). 0° is usable but
    // not ideal as a catch angle; 45° is the upper UI bound.
    anglePeakDeg: 38,
    angleWidthDeg: 22,
    // Floor so vertical catch still produces some thrust
    angleEffFloor: 0.42,

    // Late-exit / negative-blade drag factor (fraction of drive thrust
    // applied as extra rearward drag when exit is late relative to length)
    negativeBladeDragFrac: 0.22,

    // Baseline phase fractions at 60 spm (sum = 1). Higher SPM compresses
    // reach+recovery and slightly raises drive share (ISBS-ish toy).
    phaseAt60: {
      reach: 0.12,
      catch: 0.10,
      drive: 0.36,
      exit: 0.10,
      recovery: 0.32,
    },

    // Slip: blade relative speed vs water ≈ pullSpeed − slip · boatSpeed
    slip: 0.48,
    vRelFloor: 0.12,

    // Sync: at 0% sync, max phase jitter as fraction of cycle
    maxSyncJitterFrac: 0.95,
    // Pace variance: at 100% variance slider, ±spmFrac of target SPM
    // (exposed as paceVariance 0–1; default low)
    maxPaceVarianceFrac: 0.12,

    // Force shaping during drive: peaks near vertical portion of pull
    drivePeakBias: 0.55,
  };

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * η_angle ∈ (angleEffFloor, 1]. Peaks near anglePeakDeg (forward catch).
   * UI clamps angle to [0, 45].
   */
  function angleEfficiency(angleDeg) {
    const a = clamp(angleDeg, 0, 45);
    const d = a - CFG.anglePeakDeg;
    const w = CFG.angleWidthDeg;
    const g = Math.exp(-(d * d) / (2 * w * w));
    return clamp(CFG.angleEffFloor + (1 - CFG.angleEffFloor) * g, 0, 1);
  }

  /**
   * Effective submerged blade area (m²).
   * A ≈ width · depth_eff, depth_eff soft-capped so over-burying stops helping.
   */
  function effectiveArea(depthM) {
    const d = clamp(depthM, 0.02, 0.8);
    const soft = d * (1 - Math.exp(-d / CFG.depthScaleM));
    const capped = Math.min(soft, CFG.depthUsefulMaxM);
    return CFG.bladeWidthM * capped;
  }

  /**
   * Rate-dependent phase fractions. Higher SPM → shorter reach/recovery,
   * slightly higher drive:total (busy cadence, less glide setup).
   */
  function phaseFractions(spm) {
    const s = clamp(spm, 30, 100);
    // 0 at 40 spm, 1 at 90 spm
    const urgency = clamp((s - 40) / 50, 0, 1);
    const base = CFG.phaseAt60;
    // Compress reach+recovery, give a bit to drive+catch
    const reach = lerp(base.reach, 0.06, urgency);
    const recovery = lerp(base.recovery, 0.22, urgency);
    const catchP = lerp(base.catch, 0.12, urgency);
    const drive = lerp(base.drive, 0.42, urgency);
    const exit = 1 - (reach + catchP + drive + recovery);
    return {
      reach: reach,
      catch: catchP,
      drive: drive,
      exit: Math.max(0.06, exit),
      recovery: recovery,
    };
  }

  /** Water-phase = catch + drive + exit (blade immersed / propulsive window). */
  function waterFractionFromPhases(ph) {
    return ph.catch + ph.drive + ph.exit;
  }

  /**
   * Late-exit penalty: very long stroke at high rate tends to drag the
   * blade past the hip into a negative orientation → extra drag on exit.
   * Returns 0..1 severity.
   */
  function negativeBladeSeverity(params, ph) {
    // Ideal length shrinks a bit as SPM rises (can't hold a long stroke cleanly)
    const idealLen = lerp(1.55, 1.05, clamp((params.spm - 40) / 50, 0, 1));
    const over = clamp((params.strokeLengthM - idealLen) / 0.6, 0, 1);
    // Shallow exit window relative to drive also worsens late exit feel
    const exitTight = clamp(1 - ph.exit / 0.12, 0, 1);
    return over * (0.55 + 0.45 * exitTight);
  }

  function crewMassKg(crewSize) {
    const n = clamp(Math.round(crewSize), 2, 20);
    return CFG.boatMassKg + CFG.massPaddlerKg * n;
  }

  function hullDragK(crewSize) {
    const n = clamp(Math.round(crewSize), 2, 20);
    return CFG.hullDragKBase + CFG.hullDragKPerPaddler * n;
  }

  /**
   * @typedef {Object} StrokeParams
   * @property {number} strokeLengthM
   * @property {number} depthM
   * @property {number} angleDeg   0–45 only
   * @property {number} spm
   * @property {number} effort     0.5–1.2
   * @property {number} crewSize   2–20
   * @property {number} syncPct    0–100 (100 = perfect unison)
   * @property {number} paceVariance 0–1 optional SPM spread across crew
   */

  function normalizeParams(params) {
    return {
      strokeLengthM: clamp(params.strokeLengthM, 0.5, 2.2),
      depthM: clamp(params.depthM, 0.05, 0.7),
      angleDeg: clamp(params.angleDeg, 0, 45),
      spm: clamp(params.spm, 30, 100),
      effort: clamp(params.effort ?? 1, 0.5, 1.25),
      crewSize: 5,
      syncPct: clamp(params.syncPct ?? 85, 0, 100),
      paceVariance: clamp(params.paceVariance ?? 0.15, 0, 1),
      // Target 100 m time (s) for UI pacing — physics race is still free effort
      targetPaceS: clamp(params.targetPaceS ?? 28, 18, 70),
      paddlers: normalizePaddlers(params.paddlers),
    };
  }

  const CREW_SIZE = 5;
  const SKILL_PRESETS = {
    beginner: {
      id: "beginner",
      label: "Beginner",
      effortMul: 0.52,
      phaseLag: 0.14, // fraction of cycle late vs lead
      spmMul: 0.9,
      depthMul: 0.65,
      angleNudge: -12, // more upright / weaker catch
    },
    amateur: {
      id: "amateur",
      label: "Amateur",
      effortMul: 0.82,
      phaseLag: 0.045,
      spmMul: 0.98,
      depthMul: 0.9,
      angleNudge: -4,
    },
    advanced: {
      id: "advanced",
      label: "Advanced",
      effortMul: 1.0,
      phaseLag: 0,
      spmMul: 1.0,
      depthMul: 1.0,
      angleNudge: 0,
    },
  };

  function skillPreset(id) {
    return SKILL_PRESETS[id] || SKILL_PRESETS.amateur;
  }

  /** Stern (0) → bow (4). Default: beginner behind amateur. */
  function defaultPaddlers() {
    return [
      { skill: "beginner" },
      { skill: "amateur" },
      { skill: "amateur" },
      { skill: "amateur" },
      { skill: "advanced" },
    ];
  }

  function normalizePaddlers(list) {
    const base = defaultPaddlers();
    const out = [];
    for (let i = 0; i < CREW_SIZE; i++) {
      const src = (list && list[i]) || base[i];
      const skill = SKILL_PRESETS[src.skill] ? src.skill : "amateur";
      out.push({ skill: skill });
    }
    return out;
  }

  /** Deterministic paddler offset in [0,1) from index + sync. */
  function paddlerPhaseOffset(i, crewSize, syncPct) {
    const sync = clamp(syncPct, 0, 100) / 100;
    const jitterAmp = (1 - sync) * CFG.maxSyncJitterFrac;
    // Spread paddlers across the jitter band of the cycle. Stable hash so
    // simulate() matches step() without RNG drift.
    if (crewSize <= 1 || jitterAmp < 1e-6) return 0;
    // Even spacing 0..jitterAmp, plus small irregularity
    const even = (i / crewSize) * jitterAmp;
    const wobble = (((i * 37 + 11) % 17) / 17) * jitterAmp * 0.08;
    return (even + wobble) % 1;
  }

  /**
   * Explicit sync efficiency — out-of-phase crews waste overlap that a
   * pure impulse sum under-penalizes vs coaching reality (caterpillaring
   * kills the shared surge / glide). Maps 0%→~0.58, 100%→1.0.
   */
  function syncEfficiency(syncPct) {
    const s = clamp(syncPct, 0, 100) / 100;
    return 0.58 + 0.42 * Math.pow(s, 0.9);
  }

  function paddlerSpm(params, i) {
    const base = params.spm;
    if (params.paceVariance <= 0) return base;
    const amp = params.paceVariance * CFG.maxPaceVarianceFrac;
    const wobble = ((i * 19 + 7) % 13) / 13 - 0.5; // -0.5..0.5
    return clamp(base * (1 + wobble * 2 * amp), 30, 100);
  }

  /**
   * Map phase time → stage + local 0..1 progress within that stage.
   */
  function phaseAt(u, ph) {
    // u in [0,1) along cycle
    let x = ((u % 1) + 1) % 1;
    const edges = [
      ["reach", ph.reach],
      ["catch", ph.catch],
      ["drive", ph.drive],
      ["exit", ph.exit],
      ["recovery", ph.recovery],
    ];
    for (let i = 0; i < edges.length; i++) {
      const name = edges[i][0];
      const len = edges[i][1];
      if (x < len) return { name: name, local: len > 0 ? x / len : 0 };
      x -= len;
    }
    return { name: "recovery", local: 1 };
  }

  /**
   * Thrust (N) for one blade given unit cycle phase u ∈ [0,1) and that
   * paddler's effective SPM (for pull speed / phase shape).
   */
  function thrustAtPhase(params, boatSpeed, u, spm, seat) {
    const skill = skillPreset(seat && seat.skill);
    const ph = phaseFractions(spm);
    const stage = phaseAt(u, ph);
    const A = effectiveArea(params.depthM * skill.depthMul);
    const eta = angleEfficiency(clamp(params.angleDeg + skill.angleNudge, 0, 45));
    const effort = params.effort * skill.effortMul;
    const wf = waterFractionFromPhases(ph);
    const waterT = wf * (60 / spm);
    const pullSpeed = params.strokeLengthM / Math.max(waterT, 1e-3);
    const vRel = Math.max(pullSpeed - CFG.slip * boatSpeed, CFG.vRelFloor);
    const dynamic = 0.5 * CFG.rho * CFG.bladeCd * A * vRel * vRel;

    // Only catch/drive/exit produce forward thrust. Drive peaks mid-pull
    // (blade nearest vertical / buried) — coach: full bury before hard pull.
    let shape = 0;
    if (stage.name === "catch") {
      // Building bury — partial thrust
      shape = 0.35 + 0.45 * stage.local;
    } else if (stage.name === "drive") {
      // Peak near drivePeakBias through the drive
      const peak = CFG.drivePeakBias;
      const d = 1 - Math.abs(stage.local - peak) / Math.max(peak, 1 - peak);
      shape = 0.55 + 0.45 * clamp(d, 0, 1);
      // Angle toward vertical during drive boosts a bit (pull near vertical)
      const verticalBonus = lerp(1.0, 1.08, 1 - params.angleDeg / 45);
      shape *= verticalBonus;
    } else if (stage.name === "exit") {
      // Unweighting — taper; late/long stroke adds negative-blade drag later
      shape = 0.4 * (1 - stage.local);
    } else {
      shape = 0;
    }

    let F = effort * dynamic * eta * shape;

    // Negative-blade / late-exit drag during exit when severity > 0
    if (stage.name === "exit") {
      const sev = negativeBladeSeverity(params, ph);
      if (sev > 0) {
        F -= effort * dynamic * CFG.negativeBladeDragFrac * sev * stage.local;
      }
    }

    return F;
  }

  function hullDragNewtons(v, crewSize) {
    const k = hullDragK(crewSize);
    return -k * v * Math.abs(v);
  }

  /**
   * Kinematics summary for UI / ghost stroke (lead paddler / mean SPM).
   */
  function strokeKinematics(rawParams) {
    const params = normalizeParams(rawParams);
    const ph = phaseFractions(params.spm);
    const cycleT = 60 / params.spm;
    const wf = waterFractionFromPhases(ph);
    const waterT = wf * cycleT;
    const recoveryT = cycleT - waterT;
    const pullSpeed = params.strokeLengthM / Math.max(waterT, 1e-3);
    return {
      spm: params.spm,
      cycleT: cycleT,
      wf: wf,
      waterT: waterT,
      recoveryT: recoveryT,
      length: params.strokeLengthM,
      pullSpeed: pullSpeed,
      phases: ph,
      massKg: crewMassKg(params.crewSize),
      hullDragK: hullDragK(params.crewSize),
      negBlade: negativeBladeSeverity(params, ph),
    };
  }

  /**
   * Advance boat by dt. phaseTime is the lead stroke clock [0, ∞) mapped
   * into each paddler's cycle via offsets + per-paddler SPM.
   */
  function step(state, rawParams, dt) {
    const params = normalizeParams(rawParams);
    const kin = strokeKinematics(params);
    let x = state.x;
    let v = state.v;
    let t = state.t;
    let phaseTime = state.phaseTime + dt;
    let peakV = state.peakV;
    let impulseThrust = state.impulseThrust;
    let impulseDrag = state.impulseDrag;

    const n = CREW_SIZE;
    const seats = params.paddlers || defaultPaddlers();
    let Fthrust = 0;
    let anyInWater = false;

    for (let i = 0; i < n; i++) {
      const seat = seats[i] || { skill: "amateur" };
      const skill = skillPreset(seat.skill);
      const spm_i = paddlerSpm(params, i) * skill.spmMul;
      const cycleT_i = 60 / Math.max(spm_i, 20);
      const offset =
        paddlerPhaseOffset(i, n, params.syncPct) + skill.phaseLag;
      // Lead clock in seconds → this paddler's unit phase
      const u = (((phaseTime / cycleT_i + offset) % 1) + 1) % 1;
      const ph = phaseFractions(spm_i);
      const stage = phaseAt(u, ph);
      if (stage.name === "catch" || stage.name === "drive" || stage.name === "exit") {
        anyInWater = true;
      }
      Fthrust += thrustAtPhase(params, v, u, spm_i, seat);
    }

    // Sync tax: caterpillaring reduces useful net surge
    Fthrust *= syncEfficiency(params.syncPct);

    const Fdrag = hullDragNewtons(v, CREW_SIZE);
    // Slight extra wash drag when badly out of time
    const sync = params.syncPct / 100;
    const FdragAdj = Fdrag * (1 + 0.12 * (1 - sync));
    const F = Fthrust + FdragAdj;
    const mass = crewMassKg(CREW_SIZE);
    const a = F / mass;

    v = v + a * dt;
    if (v < 0) v = 0;
    x = x + v * dt;
    t = t + dt;
    peakV = Math.max(peakV, v);

    impulseThrust += Math.max(0, Fthrust) * dt;
    impulseDrag += Math.abs(FdragAdj) * dt;

    // Sync quality proxy: ratio of net thrust to what perfect unison would do
    // (updated lightly for coaching notes)
    const syncMetric = params.syncPct / 100;

    return {
      x: x,
      v: v,
      t: t,
      phaseTime: phaseTime,
      peakV: peakV,
      impulseThrust: impulseThrust,
      impulseDrag: impulseDrag,
      inWater: anyInWater,
      kin: kin,
      Fthrust: Fthrust,
      Fdrag: FdragAdj,
      syncMetric: syncMetric,
      finished: x >= RACE_DISTANCE_M,
    };
  }

  function initialState() {
    return {
      x: 0,
      v: 0,
      t: 0,
      phaseTime: 0,
      peakV: 0,
      impulseThrust: 0,
      impulseDrag: 0,
      inWater: false,
      finished: false,
      syncMetric: 1,
    };
  }

  function simulate(rawParams, opts) {
    const params = normalizeParams(rawParams);
    const dt = (opts && opts.dt) || 1 / 60;
    const maxT = (opts && opts.maxT) || 120;
    let s = initialState();
    const samples = [];
    const sampleEvery = (opts && opts.sampleEvery) || 0;
    let nextSample = 0;

    while (!s.finished && s.t < maxT) {
      s = step(s, params, dt);
      if (sampleEvery > 0 && s.t >= nextSample) {
        samples.push({ t: s.t, v: s.v, x: s.x });
        nextSample += sampleEvery;
      }
    }

    const dist = Math.min(s.x, RACE_DISTANCE_M);
    const avgV = s.t > 0 ? dist / s.t : 0;
    const thrustShare =
      s.impulseThrust + s.impulseDrag > 0
        ? s.impulseThrust / (s.impulseThrust + s.impulseDrag)
        : 0;

    return {
      time: s.t,
      distance: dist,
      avgSpeed: avgV,
      peakSpeed: s.peakV,
      finished: s.finished,
      thrustShare: thrustShare,
      kin: strokeKinematics(params),
      angleEff: angleEfficiency(params.angleDeg),
      area: effectiveArea(params.depthM),
      syncPct: params.syncPct,
      crewSize: params.crewSize,
      samples: samples,
    };
  }

  function defaultParams() {
    return {
      strokeLengthM: 1.35,
      depthM: 0.32,
      angleDeg: 35,
      spm: 72,
      effort: 1.0,
      crewSize: 5,
      syncPct: 85,
      paceVariance: 0.15,
      targetPaceS: 28,
      paddlers: defaultPaddlers(),
    };
  }

  const PARAM_RANGES = {
    strokeLengthM: { min: 0.6, max: 2.0, step: 0.05, label: "Stroke length" },
    depthM: { min: 0.08, max: 0.65, step: 0.01, label: "Insert depth" },
    angleDeg: { min: 0, max: 45, step: 1, label: "Insert angle" },
    spm: { min: 40, max: 95, step: 1, label: "Stroke rate" },
    effort: { min: 0.6, max: 1.2, step: 0.05, label: "Effort" },
    syncPct: { min: 0, max: 100, step: 5, label: "Sync" },
    paceVariance: { min: 0, max: 1, step: 0.05, label: "Pace variance" },
  };

  /** How much each slider moves avg speed (hold others fixed, lo→hi of range). */
  function speedImpact(rawParams) {
    const base = normalizeParams(rawParams);
    const keys = Object.keys(PARAM_RANGES);
    const rows = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const r = PARAM_RANGES[key];
      const loP = Object.assign({}, base);
      const hiP = Object.assign({}, base);
      loP[key] = r.min;
      hiP[key] = r.max;
      const lo = simulate(loP, { dt: 1 / 40, maxT: 90 });
      const hi = simulate(hiP, { dt: 1 / 40, maxT: 90 });
      const vLo = lo.finished ? lo.avgSpeed : 0;
      const vHi = hi.finished ? hi.avgSpeed : 0;
      const delta = vHi - vLo;
      const cur = base[key];
      // Best end of range for speed
      const preferHigh = delta >= 0;
      const best = preferHigh ? r.max : r.min;
      rows.push({
        key: key,
        label: r.label,
        delta: delta,
        vLo: vLo,
        vHi: vHi,
        current: cur,
        best: best,
        preferHigh: preferHigh,
        room: preferHigh ? best - cur : cur - best,
      });
    }
    rows.sort(function (a, b) {
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
    return rows;
  }

  /** Greedy hill-climb for fastest 100 m within slider ranges. */
  function optimiseParams(rawParams) {
    let best = normalizeParams(rawParams);
    // Race hard: effort up, variance down as starting bias
    best.effort = Math.max(best.effort, 1.0);
    best.paceVariance = Math.min(best.paceVariance, 0.1);
    let bestRes = simulate(best, { dt: 1 / 45, maxT: 90 });
    let bestT = bestRes.finished ? bestRes.time : 1e9;
    const keys = Object.keys(PARAM_RANGES);
    for (let round = 0; round < 4; round++) {
      let improved = false;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const r = PARAM_RANGES[key];
        const candidates = [];
        for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
          candidates.push(Math.round(v / r.step) * r.step);
        }
        // Also try current
        candidates.push(best[key]);
        let localBest = best[key];
        let localT = bestT;
        for (let c = 0; c < candidates.length; c++) {
          const trial = Object.assign({}, best);
          trial[key] = candidates[c];
          trial.crewSize = 5;
          const res = simulate(trial, { dt: 1 / 45, maxT: 90 });
          const t = res.finished ? res.time : 1e9;
          if (t + 1e-6 < localT) {
            localT = t;
            localBest = trial[key];
          }
        }
        if (localT + 1e-6 < bestT) {
          best[key] = localBest;
          bestT = localT;
          improved = true;
        }
      }
      if (!improved) break;
    }
    best = normalizeParams(best);
    const finalRes = simulate(best, { dt: 1 / 45, maxT: 90 });
    return { params: best, result: finalRes };
  }

  function syncNote(params) {
    if (params.syncPct >= 90) {
      return "Crew sync is tight — force lands together and the boat gets clean glide between drives.";
    }
    if (params.syncPct >= 70) {
      return "Sync is decent; a bit of caterpillaring is shaving peak force.";
    }
    if (params.syncPct >= 40) {
      return "Noticeable caterpillaring: paddlers peak at different times, so net thrust is choppier and average speed drops.";
    }
    return "Very poor sync — the crew is fighting itself. Unison timing would unlock more speed than raw effort here.";
  }

  function coachingNote(rawParams, result) {
    const params = normalizeParams(rawParams);
    const bits = [];
    const eta = result.angleEff != null ? result.angleEff : angleEfficiency(params.angleDeg);

    if (params.syncPct < 55) {
      bits.push(syncNote(params));
    } else if (eta < 0.55) {
      bits.push(
        "Catch angle is too upright for a strong bury — coaches look for a forward ~35–45° insert, then pull toward vertical."
      );
    } else if (params.angleDeg < 12) {
      bits.push(
        "Near-vertical catch: little reach into the water. Open toward ~35–45° at insert, then pull tall."
      );
    } else if (params.depthM < 0.18) {
      bits.push(
        "Blade is shallow: little area in the water, so thrust is weak even at high rate."
      );
    } else if (params.depthM > 0.5) {
      bits.push(
        "Very deep insert: more area, but exit gets messy — bury fully, then exit by the hip before the blade goes negative."
      );
    } else if (result.kin && result.kin.negBlade > 0.45) {
      bits.push(
        "Stroke may be over-long for this rate — late exit risks a negative blade (drag). Exit mid-thigh / by the hip."
      );
    } else if (params.spm > 85 && params.strokeLengthM < 1.0) {
      bits.push(
        "High rate with a short stroke: busy arms, low impulse per stroke. Lengthen the drive a touch."
      );
    } else if (params.spm < 55) {
      bits.push(
        "Rate is low — hull drag bleeds speed between drives. Pick up SPM or lengthen each stroke."
      );
    } else if (params.syncPct < 80) {
      bits.push(syncNote(params));
    } else if (result.thrustShare > 0.6) {
      bits.push(
        "Thrust dominated this run: solid bury and drive vs drag. Fine-tune rate vs length for top-end speed."
      );
    } else {
      bits.push(
        "Drag is eating a big share of impulse — build more drive (depth / catch angle / length) or tighten sync."
      );
    }
    return bits[0];
  }

  global.DragonPhysics = {
    CFG: CFG,
    RACE_DISTANCE_M: RACE_DISTANCE_M,
    clamp: clamp,
    angleEfficiency: angleEfficiency,
    effectiveArea: effectiveArea,
    phaseFractions: phaseFractions,
    phaseAt: phaseAt,
    waterFractionFromPhases: waterFractionFromPhases,
    strokeKinematics: strokeKinematics,
    thrustAtPhase: thrustAtPhase,
    hullDragNewtons: hullDragNewtons,
    crewMassKg: crewMassKg,
    paddlerPhaseOffset: paddlerPhaseOffset,
    syncEfficiency: syncEfficiency,
    normalizeParams: normalizeParams,
    step: step,
    initialState: initialState,
    simulate: simulate,
    defaultParams: defaultParams,
    coachingNote: coachingNote,
    syncNote: syncNote,
    PARAM_RANGES: PARAM_RANGES,
    speedImpact: speedImpact,
    optimiseParams: optimiseParams,
    CREW_SIZE: CREW_SIZE,
    SKILL_PRESETS: SKILL_PRESETS,
    defaultPaddlers: defaultPaddlers,
    normalizePaddlers: normalizePaddlers,
    skillPreset: skillPreset,
  };
})(typeof window !== "undefined" ? window : globalThis);
