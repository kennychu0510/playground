/**
 * Dragonboat Lab — toy 1D propulsion model
 * =========================================
 * NOT CFD. Goal: slider extremes clearly change 100 m time, with formulas
 * an iOS engineer can read and retune.
 *
 * Assumptions
 * -----------
 * 1. One "crew-equivalent" paddle: sliders describe the stroke everyone
 *    mirrors. Thrust is scaled as if N effective blades pull together.
 * 2. Standing start on flat water. Race distance is fixed (100 m).
 * 3. Water phase applies forward thrust; recovery applies hull drag only.
 * 4. Blade force uses a quadratic water-resistance toy:
 *      F_blade ∝ ρ · A_eff · v_rel² · η_angle
 *    Reaction on the boat is +F_blade (action–reaction).
 * 5. Hull drag is quadratic: F_drag = −k_d · v · |v|.
 * 6. Insert angle η peaks slightly off vertical (dragonboat catch is
 *    often ~5–15° from vertical). Flat or wildly past-vertical waste force.
 * 7. Depth adds area with diminishing returns; very deep adds recovery
 *    penalty via a slightly lower water-phase fraction (harder exit).
 *
 * Integration: semi-implicit Euler, fixed dt (usually 1/60 s).
 */

(function (global) {
  "use strict";

  const RACE_DISTANCE_M = 100;

  /** Tunable world constants — tweak these if results feel flat. */
  const CFG = {
    // Effective mass: boat + crew (toy). Lower = snappier acceleration.
    massKg: 900,

    // Hull quadratic drag coefficient (N / (m/s)²). Higher = harder top speed.
    hullDragK: 18,

    // Water density (kg/m³)
    rho: 1000,

    // Blade "Cd · shape" factor (dimensionless toy)
    bladeCd: 1.15,

    // Assumed blade width in meters (fixed paddle face)
    bladeWidthM: 0.18,

    // How many effective blades (crew unison scale). 10 ≈ half a standard boat.
    crewBlades: 10,

    // Depth where area gain starts flattening (m)
    depthScaleM: 0.28,

    // Soft max useful depth (m) — beyond this, little extra thrust
    depthUsefulMaxM: 0.55,

    // Angle efficiency Gaussian: peakDeg from vertical, widthDeg
    anglePeakDeg: 10,
    angleWidthDeg: 28,

    // Baseline water-phase fraction of the stroke cycle (catch→exit)
    waterFractionBase: 0.48,

    // Extra recovery cost when paddling very deep (reduces water fraction)
    deepRecoveryPenalty: 0.08,

    // Slip: blade relative speed vs water ≈ pullSpeed − slip · boatSpeed
    // (paddle isn't a perfect fixed point in the water)
    slip: 0.55,

    // Minimum relative speed used in thrust (avoids zero at start edge cases)
    vRelFloor: 0.15,
  };

  /**
   * @typedef {Object} StrokeParams
   * @property {number} strokeLengthM  catch-to-exit arc length through water
   * @property {number} depthM         blade insert depth
   * @property {number} angleDeg       insert angle from vertical (0 = vertical)
   * @property {number} spm            strokes per minute
   * @property {number} effort         0.5–1.2 multiplier on force (optional)
   * @property {number} waterFraction  override water-phase ratio (optional)
   */

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  /** η_angle ∈ (0, 1], peaks near anglePeakDeg from vertical. */
  function angleEfficiency(angleDeg) {
    const d = angleDeg - CFG.anglePeakDeg;
    const w = CFG.angleWidthDeg;
    return Math.exp(-(d * d) / (2 * w * w));
  }

  /**
   * Effective submerged blade area (m²).
   * A ≈ width · depth_eff, with depth_eff = depth · (1 − e^(−depth/scale))
   * soft-capped so "burying" the blade stops helping.
   */
  function effectiveArea(depthM) {
    const d = clamp(depthM, 0.02, 0.8);
    const soft = d * (1 - Math.exp(-d / CFG.depthScaleM));
    const capped = Math.min(soft, CFG.depthUsefulMaxM);
    return CFG.bladeWidthM * capped;
  }

  /**
   * Water-phase fraction: deep inserts take longer to exit → slightly
   * less of the cycle is pure propulsion (recovery cost).
   */
  function waterFraction(params) {
    if (params.waterFraction != null) return clamp(params.waterFraction, 0.25, 0.7);
    const deep = clamp((params.depthM - 0.25) / 0.4, 0, 1);
    return clamp(
      CFG.waterFractionBase - deep * CFG.deepRecoveryPenalty,
      0.32,
      0.58
    );
  }

  /** Kinematics derived from stroke length, rate, and water fraction. */
  function strokeKinematics(params) {
    const spm = clamp(params.spm, 20, 90);
    const cycleT = 60 / spm; // seconds per stroke
    const wf = waterFraction(params);
    const waterT = wf * cycleT;
    const recoveryT = cycleT - waterT;
    const length = clamp(params.strokeLengthM, 0.4, 2.2);
    // Mean blade pull speed through the water during the drive
    const pullSpeed = length / Math.max(waterT, 1e-3);
    return { spm, cycleT, wf, waterT, recoveryT, length, pullSpeed };
  }

  /**
   * Instantaneous forward thrust (N) while the blade is in the water.
   *
   *   v_rel = max(pullSpeed − slip · v_boat, vRelFloor)
   *   F     = crew · effort · (½ ρ Cd A) · v_rel² · η_angle
   *
   * (½ ρ Cd A is the usual dynamic-pressure · area form.)
   */
  function thrustNewtons(params, boatSpeed, kin) {
    const A = effectiveArea(params.depthM);
    const eta = angleEfficiency(params.angleDeg);
    const effort = clamp(params.effort ?? 1, 0.5, 1.25);
    const vRel = Math.max(
      kin.pullSpeed - CFG.slip * boatSpeed,
      CFG.vRelFloor
    );
    const dynamic = 0.5 * CFG.rho * CFG.bladeCd * A * vRel * vRel;
    return CFG.crewBlades * effort * dynamic * eta;
  }

  function hullDragNewtons(v) {
    // −k · v · |v|  (always opposes motion)
    return -CFG.hullDragK * v * Math.abs(v);
  }

  /**
   * Advance the boat by dt seconds.
   * phaseTime is time into the current stroke cycle [0, cycleT).
   */
  function step(state, params, dt) {
    const kin = strokeKinematics(params);
    let { x, v, t, phaseTime, peakV, impulseThrust, impulseDrag } = state;

    phaseTime = (phaseTime + dt) % kin.cycleT;
    const inWater = phaseTime < kin.waterT;

    let Fthrust = 0;
    if (inWater) {
      Fthrust = thrustNewtons(params, v, kin);
    }
    const Fdrag = hullDragNewtons(v);
    const F = Fthrust + Fdrag;
    const a = F / CFG.massKg;

    // Semi-implicit Euler
    v = v + a * dt;
    if (v < 0) v = 0; // no backward sailing in this toy
    x = x + v * dt;
    t = t + dt;
    peakV = Math.max(peakV, v);

    impulseThrust += Fthrust * dt;
    impulseDrag += Math.abs(Fdrag) * dt;

    return {
      x,
      v,
      t,
      phaseTime,
      peakV,
      impulseThrust,
      impulseDrag,
      inWater,
      kin,
      Fthrust,
      Fdrag,
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
    };
  }

  /**
   * Fast-forward simulation (no rendering) until finish or timeout.
   * Useful for live "estimated time" while editing.
   */
  function simulate(params, opts) {
    const dt = (opts && opts.dt) || 1 / 60;
    const maxT = (opts && opts.maxT) || 120;
    let s = initialState();
    while (!s.finished && s.t < maxT) {
      s = step(s, params, dt);
    }
    const avgV = s.t > 0 ? Math.min(s.x, RACE_DISTANCE_M) / s.t : 0;
    const thrustShare =
      s.impulseThrust + s.impulseDrag > 0
        ? s.impulseThrust / (s.impulseThrust + s.impulseDrag)
        : 0;
    return {
      time: s.t,
      distance: Math.min(s.x, RACE_DISTANCE_M),
      avgSpeed: avgV,
      peakSpeed: s.peakV,
      finished: s.finished,
      thrustShare,
      kin: strokeKinematics(params),
      angleEff: angleEfficiency(params.angleDeg),
      area: effectiveArea(params.depthM),
    };
  }

  /** Default “competent crew” slider values. */
  function defaultParams() {
    return {
      strokeLengthM: 1.35,
      depthM: 0.32,
      angleDeg: 12,
      spm: 72,
      effort: 1.0,
    };
  }

  /** One-line coaching note from a finished (or estimated) result. */
  function coachingNote(params, result) {
    const bits = [];
    const eta = result.angleEff;
    if (eta < 0.55) {
      bits.push(
        "Insert angle is far from the ~10° sweet spot — a lot of force is spilling as lift/splash instead of forward thrust."
      );
    } else if (params.depthM < 0.18) {
      bits.push(
        "Blade is shallow: little area in the water, so thrust is weak even at high rate."
      );
    } else if (params.depthM > 0.5) {
      bits.push(
        "Very deep insert: more area, but recovery costs bite into water-phase time — exit cleaner or ease depth."
      );
    } else if (params.spm > 82 && params.strokeLengthM < 1.0) {
      bits.push(
        "High rate with a short stroke: busy arms, low impulse per stroke. Lengthen the drive a bit."
      );
    } else if (params.spm < 55) {
      bits.push(
        "Rate is low — hull drag has more time to bleed speed between drives. Pick up SPM or lengthen each stroke."
      );
    } else if (result.thrustShare > 0.62) {
      bits.push(
        "Thrust dominated this run: solid drive vs drag. Fine-tune rate vs length for top-end speed."
      );
    } else {
      bits.push(
        "Drag is eating a big share of impulse — either build more drive (depth/angle/length) or accept a lower cruise."
      );
    }
    return bits[0];
  }

  global.DragonPhysics = {
    CFG,
    RACE_DISTANCE_M,
    clamp,
    angleEfficiency,
    effectiveArea,
    waterFraction,
    strokeKinematics,
    thrustNewtons,
    hullDragNewtons,
    step,
    initialState,
    simulate,
    defaultParams,
    coachingNote,
  };
})(typeof window !== "undefined" ? window : globalThis);
