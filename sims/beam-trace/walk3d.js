/** Steep third-person 3D walk / fall — Three.js. */

import * as THREE from "three";
import { padCenter, pointInPad } from "./levels.js";

const WORLD = 40; // map UV 0..1 → -WORLD/2 .. WORLD/2 on XZ

/**
 * @typedef {{x:number,y:number,t:number}} StrokePoint
 */

export class Walk3D {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onClear?: () => void,
   *   onFall?: (fallUV:{x:number,y:number}) => void,
   *   onSpeed?: (kmh:number, gait:string) => void
   * }} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.running = false;
    this.fastForward = false;
    this.mode = /** @type {"idle"|"walk"|"fall"|"rescue"|"done"} */ ("idle");

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0xb8c4d4, 1);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xb8c4d4, 40, 160);

    this.camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.1, 300);
    this.clock = new THREE.Clock(false);

    this.worker = null;
    this.beamGroup = null;
    this.cityGroup = null;
    this.trampoline = null;
    this.path = /** @type {{pos:THREE.Vector3, uv:{x:number,y:number}, speed:number}[]} */ ([]);
    this.pathLen = 0;
    this.dist = 0;
    this.fallVel = 0;
    this.stage = null;
    this.reachedGoal = false;
    this.fallUV = null;
    this._raf = 0;
    this._tmp = new THREE.Vector3();
    this._look = new THREE.Vector3();

    this._onResize = this._onResize.bind(this);
    this._frame = this._frame.bind(this);
  }

  activate() {
    this.canvas.classList.add("active");
    this._onResize();
    window.addEventListener("resize", this._onResize);
  }

  deactivate() {
    this.canvas.classList.remove("active");
    window.removeEventListener("resize", this._onResize);
    this.stop();
  }

  setFastForward(on) {
    this.fastForward = !!on;
  }

  /**
   * @param {import('./levels.js').Stage} stage
   * @param {StrokePoint[]} stroke
   * @param {{reachedGoal:boolean}} meta
   */
  start(stage, stroke, meta) {
    this.stop();
    this.stage = stage;
    this.reachedGoal = !!meta.reachedGoal;
    this.fallUV = null;
    this.mode = "walk";
    this.dist = 0;
    this.fallVel = 0;
    this.fastForward = false;

    this._clearSceneExtras();
    this._buildCity(stage);
    this._buildPath(stroke, stage);
    this._buildBeam();
    this._buildWorker();
    this._buildTrampoline();

    // Place camera initially
    if (this.path.length) {
      const p0 = this.path[0].pos;
      this.camera.position.set(p0.x, p0.y + 6, p0.z + 8);
      this.camera.lookAt(p0.x, p0.y, p0.z - 4);
    }

    this.activate();
    this.running = true;
    this.clock.start();
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    this.clock.stop();
    cancelAnimationFrame(this._raf);
  }

  dispose() {
    this.stop();
    this.deactivate();
    this._clearSceneExtras();
    this.renderer.dispose();
  }

  // ---- build ----
  _clearSceneExtras() {
    const kill = [];
    this.scene.traverse((o) => {
      if (o.userData?.ephemeral) kill.push(o);
    });
    for (const o of kill) {
      o.parent?.remove(o);
      o.geometry?.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose?.();
      }
    }
    // lights / fog stay; rebuild lights if missing
    if (!this.scene.getObjectByName("hemi")) {
      const hemi = new THREE.HemisphereLight(0xfff0dd, 0x445566, 0.85);
      hemi.name = "hemi";
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xffe6c8, 1.05);
      sun.position.set(30, 80, 20);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.name = "sun";
      this.scene.add(sun);
    }
  }

  _uvToWorld(u, v, y) {
    // u right, v down in draw space → x right, z toward -goal (up on map = -z)
    const x = (u - 0.5) * WORLD;
    const z = (v - 0.5) * WORLD;
    return new THREE.Vector3(x, y, z);
  }

  _buildCity(stage) {
    const g = new THREE.Group();
    g.userData.ephemeral = true;
    this.cityGroup = g;

    const alt = stage.alt;
    // Ground / street
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: 0x5a5e66 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    g.add(ground);

    // Crosswalk strips
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = -3; i <= 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 8), stripeMat);
      s.position.set(i * 2.2, 0.02, 0);
      g.add(s);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.02, 1.2), stripeMat);
      s2.position.set(0, 0.02, i * 2.2);
      g.add(s2);
    }

    // Trees
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x3d8c4a });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    for (let i = 0; i < 16; i++) {
      const tx = ((i * 17) % 40) - 20;
      const tz = ((i * 29) % 40) - 20;
      if (Math.abs(tx) < 4 && Math.abs(tz) < 4) continue;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), trunkMat);
      trunk.position.set(tx, 0.6, tz);
      g.add(trunk);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 6), treeMat);
      canopy.position.set(tx, 2.2, tz);
      g.add(canopy);
    }

    // Tower buildings flanking the gap
    const bMat = new THREE.MeshLambertMaterial({ color: 0x8a909a });
    const bMat2 = new THREE.MeshLambertMaterial({ color: 0x6e7480 });
    const towerH = alt + 8;
    const placements = [
      { x: -14, z: -6, w: 8, d: 10, mat: bMat },
      { x: 14, z: -4, w: 9, d: 9, mat: bMat2 },
      { x: -12, z: 10, w: 7, d: 8, mat: bMat2 },
      { x: 13, z: 12, w: 8, d: 7, mat: bMat },
      { x: -18, z: 2, w: 6, d: 12, mat: bMat },
      { x: 18, z: -12, w: 6, d: 10, mat: bMat2 },
    ];
    for (const p of placements) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, towerH, p.d),
        p.mat
      );
      mesh.position.set(p.x, towerH / 2, p.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      // window dots
      const winMat = new THREE.MeshBasicMaterial({ color: 0x2a3038 });
      for (let wy = 4; wy < towerH - 2; wy += 3.5) {
        for (let wx = -p.w / 2 + 1; wx < p.w / 2 - 1; wx += 2) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), winMat);
          win.position.set(p.x + p.w / 2 + 0.02, wy, p.z + wx);
          win.rotation.y = Math.PI / 2;
          g.add(win);
        }
      }
    }

    // Start / goal pads as concrete slabs at altitude
    this._addPad3D(g, stage.start, alt, 0x2bb8b0);
    this._addPad3D(g, stage.goal, alt, 0xf0c419);

    // Obstacle cores as vertical columns
    for (const ob of stage.obstacles) {
      const cx = (ob.x + ob.w / 2 - 0.5) * WORLD;
      const cz = (ob.y + ob.h / 2 - 0.5) * WORLD;
      const ww = ob.w * WORLD;
      const dd = ob.h * WORLD;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(ww, towerH * 0.85, dd),
        new THREE.MeshLambertMaterial({ color: 0x3a404c })
      );
      core.position.set(cx, (towerH * 0.85) / 2, cz);
      core.castShadow = true;
      g.add(core);
    }

    // Distant skyline boxes
    const farMat = new THREE.MeshLambertMaterial({ color: 0x9aa3b0 });
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const r = 45 + (i % 5) * 4;
      const h = 10 + (i * 7) % 30;
      const m = new THREE.Mesh(new THREE.BoxGeometry(4 + (i % 3), h, 4), farMat);
      m.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
      g.add(m);
    }

    this.scene.add(g);
  }

  _addPad3D(group, pad, alt, accent) {
    const c = padCenter(pad);
    const pos = this._uvToWorld(c.x, c.y, alt);
    const w = pad.w * WORLD;
    const d = pad.h * WORLD;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.5, d),
      new THREE.MeshLambertMaterial({ color: 0x9aa0a8 })
    );
    slab.position.copy(pos);
    slab.position.y = alt;
    slab.receiveShadow = true;
    group.add(slab);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1.2, 1.2, d + 1.2),
      new THREE.MeshLambertMaterial({ color: 0x4a2c1c })
    );
    frame.position.copy(pos);
    frame.position.y = alt - 0.6;
    group.add(frame);

    // plaque
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.5, 0.15, 0.6),
      new THREE.MeshLambertMaterial({ color: accent })
    );
    plaque.position.set(pos.x, alt + 0.4, pos.z - d * 0.15);
    group.add(plaque);
  }

  /**
   * @param {StrokePoint[]} stroke
   * @param {import('./levels.js').Stage} stage
   */
  _buildPath(stroke, stage) {
    const alt = stage.alt;
    this.path = [];
    if (!stroke || stroke.length < 2) {
      const a = padCenter(stage.start);
      const b = padCenter(stage.goal);
      this.path.push({
        pos: this._uvToWorld(a.x, a.y, alt + 0.4),
        uv: { x: a.x, y: a.y },
        speed: 2,
      });
      this.path.push({
        pos: this._uvToWorld(b.x, b.y, alt + 0.4),
        uv: { x: b.x, y: b.y },
        speed: 2,
      });
    } else {
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        let speed = 2.5; // m/s baseline
        if (i > 0) {
          const prev = stroke[i - 1];
          const dt = Math.max(0.016, (p.t - prev.t) / 1000);
          const du = p.x - prev.x;
          const dv = p.y - prev.y;
          const distUV = Math.hypot(du, dv);
          const distM = distUV * WORLD;
          const drawSpeed = distM / dt; // "meters" of map per second of draw
          // Map draw speed → walk speed. Fast scribble ≈ sprint.
          speed = clamp(1.2 + drawSpeed * 0.35, 1.2, 14);
        }
        this.path.push({
          pos: this._uvToWorld(p.x, p.y, alt + 0.4),
          uv: { x: p.x, y: p.y },
          speed,
        });
      }
    }
    // cumulative lengths
    this.pathLen = 0;
    this._cum = [0];
    for (let i = 1; i < this.path.length; i++) {
      this.pathLen += this.path[i].pos.distanceTo(this.path[i - 1].pos);
      this._cum.push(this.pathLen);
    }
  }

  _buildBeam() {
    const g = new THREE.Group();
    g.userData.ephemeral = true;
    this.beamGroup = g;
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8c43a });
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0x8a6a1a });
    const beamW = 0.85;
    const beamH = 0.45;

    for (let i = 1; i < this.path.length; i++) {
      const a = this.path[i - 1].pos;
      const b = this.path[i].pos;
      const len = a.distanceTo(b);
      if (len < 0.05) continue;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(beamW, beamH, len + 0.05), mat);
      mesh.position.copy(mid);
      mesh.position.y -= 0.15;
      mesh.lookAt(b);
      mesh.rotateX(Math.PI / 2);
      mesh.castShadow = true;
      g.add(mesh);
      // side rails
      const rail = new THREE.Mesh(new THREE.BoxGeometry(beamW + 0.08, 0.12, len + 0.05), edgeMat);
      rail.position.copy(mesh.position);
      rail.position.y += 0.2;
      rail.quaternion.copy(mesh.quaternion);
      g.add(rail);
    }
    this.scene.add(g);
  }

  _buildWorker() {
    const g = new THREE.Group();
    g.userData.ephemeral = true;
    // body
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x1e3a6e })
    );
    torso.position.y = 0.85;
    g.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0xc4a574 })
    );
    head.position.y = 1.4;
    g.add(head);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.18, 12),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
    );
    hat.position.y = 1.55;
    g.add(hat);
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f5 })
    );
    brim.position.y = 1.46;
    g.add(brim);
    const pants = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.45, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xc9b07a })
    );
    pants.position.y = 0.35;
    g.add(pants);
    // legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0xb89a62 });
    this._legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), legMat);
    this._legL.position.set(-0.12, 0.1, 0);
    g.add(this._legL);
    this._legR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.16), legMat);
    this._legR.position.set(0.12, 0.1, 0);
    g.add(this._legR);

    if (this.path.length) g.position.copy(this.path[0].pos);
    this.worker = g;
    this.scene.add(g);
  }

  _buildTrampoline() {
    const g = new THREE.Group();
    g.userData.ephemeral = true;
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a6fd6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.55, 8, 24), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6;
    g.add(ring);
    const mat2 = new THREE.MeshLambertMaterial({ color: 0xd62828 });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 24), mat2);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.7;
    g.add(ring2);
    const cloth = new THREE.Mesh(
      new THREE.CircleGeometry(2.8, 24),
      new THREE.MeshLambertMaterial({ color: 0x3a8cff, side: THREE.DoubleSide })
    );
    cloth.rotation.x = -Math.PI / 2;
    cloth.position.y = 0.65;
    g.add(cloth);
    // place under end of path projected to ground
    const end = this.path[this.path.length - 1]?.pos || new THREE.Vector3();
    g.position.set(end.x, 0, end.z);
    g.visible = false;
    this.trampoline = g;
    this.scene.add(g);

    // rescue workers
    for (let i = 0; i < 3; i++) {
      const rw = this._makeRescueWorker();
      const ang = (i / 3) * Math.PI * 2;
      rw.position.set(end.x + Math.cos(ang) * 4.5, 0, end.z + Math.sin(ang) * 4.5);
      rw.visible = false;
      rw.userData.ephemeral = true;
      rw.userData.rescue = true;
      this.scene.add(rw);
    }
  }

  _makeRescueWorker() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.9, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xff6a1a })
    );
    body.position.y = 1.0;
    g.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0xc4a574 })
    );
    head.position.y = 1.6;
    g.add(head);
    // arms up
    const armMat = new THREE.MeshLambertMaterial({ color: 0xff6a1a });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), armMat);
    armL.position.set(-0.35, 1.4, 0);
    armL.rotation.z = 0.8;
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), armMat);
    armR.position.set(0.35, 1.4, 0);
    armR.rotation.z = -0.8;
    g.add(armR);
    return g;
  }

  // ---- animation ----
  _frame() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._frame);
    const dt = Math.min(0.05, this.clock.getDelta()) * (this.fastForward ? 3.2 : 1);

    if (this.mode === "walk") this._tickWalk(dt);
    else if (this.mode === "fall") this._tickFall(dt);
    else if (this.mode === "rescue") this._tickRescue(dt);

    this.renderer.render(this.scene, this.camera);
  }

  _sample(dist) {
    if (dist <= 0) return { pos: this.path[0].pos.clone(), tang: this.path[1].pos.clone().sub(this.path[0].pos).normalize(), uv: this.path[0].uv, speed: this.path[0].speed, idx: 0 };
    if (dist >= this.pathLen) {
      const n = this.path.length;
      const tang = this.path[n - 1].pos.clone().sub(this.path[n - 2].pos).normalize();
      return { pos: this.path[n - 1].pos.clone(), tang, uv: this.path[n - 1].uv, speed: this.path[n - 1].speed, idx: n - 1 };
    }
    let i = 1;
    while (i < this._cum.length && this._cum[i] < dist) i++;
    const d0 = this._cum[i - 1];
    const d1 = this._cum[i];
    const t = (dist - d0) / Math.max(1e-6, d1 - d0);
    const a = this.path[i - 1];
    const b = this.path[i];
    const pos = a.pos.clone().lerp(b.pos, t);
    const tang = b.pos.clone().sub(a.pos).normalize();
    const speed = lerp(a.speed, b.speed, t);
    const uv = { x: lerp(a.uv.x, b.uv.x, t), y: lerp(a.uv.y, b.uv.y, t) };
    return { pos, tang, uv, speed, idx: i };
  }

  _tickWalk(dt) {
    const sample = this._sample(this.dist);
    const speed = sample.speed;
    this.dist += speed * dt;

    // gait label
    const kmh = speed * 3.6;
    let gait = "toddle";
    if (kmh > 25) gait = "sprint";
    else if (kmh > 14) gait = "brisk";
    else if (kmh > 8) gait = "walk";
    this.hooks.onSpeed?.(kmh, gait);

    // place worker
    this.worker.position.copy(sample.pos);
    if (sample.tang.lengthSq() > 0.0001) {
      const look = sample.pos.clone().add(sample.tang);
      this.worker.lookAt(look.x, sample.pos.y, look.z);
    }
    // leg swing
    const swing = Math.sin(this.dist * 4.5) * 0.55;
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;

    // steep third-person camera: behind + above, looking down the shaft
    const back = sample.tang.clone().multiplyScalar(-3.2);
    const camPos = sample.pos.clone().add(back);
    camPos.y += 7.5;
    // slight side offset so towers frame the drop
    const side = new THREE.Vector3(-sample.tang.z, 0, sample.tang.x).normalize().multiplyScalar(1.2);
    camPos.add(side);
    this.camera.position.lerp(camPos, 1 - Math.pow(0.0008, dt));
    this._look.copy(sample.pos);
    this._look.y -= 6;
    this._look.add(sample.tang.clone().multiplyScalar(8));
    this.camera.lookAt(this._look);

    // End of beam?
    if (this.dist >= this.pathLen - 0.05) {
      const endUV = this.path[this.path.length - 1].uv;
      const onGoal = pointInPad(endUV.x, endUV.y, this.stage.goal, 0.05);
      if (onGoal) {
        this.mode = "done";
        this.hooks.onClear?.();
      } else {
        // walk off the end → fall
        this.fallUV = { x: endUV.x, y: endUV.y };
        this.mode = "fall";
        this.fallVel = 0;
        this._fallStartY = this.worker.position.y;
        this._fallTime = 0;
      }
    }
  }

  _tickFall(dt) {
    this._fallTime += dt;
    this.fallVel += 28 * dt;
    this.worker.position.y -= this.fallVel * dt;
    this.worker.rotation.x += dt * 1.2;
    this.worker.rotation.z += dt * 0.7;

    // camera plunges with slight lag
    const target = this.worker.position.clone();
    target.y += 4;
    target.z += 3;
    this.camera.position.lerp(target, 1 - Math.pow(0.002, dt));
    this.camera.lookAt(this.worker.position.x, Math.max(0, this.worker.position.y - 2), this.worker.position.z);

    // show trampoline as we near ground
    if (this.worker.position.y < 25 && this.trampoline) {
      this.trampoline.visible = true;
      this.scene.traverse((o) => {
        if (o.userData?.rescue) o.visible = true;
      });
    }

    if (this.worker.position.y <= 1.2) {
      this.worker.position.y = 1.2;
      this.mode = "rescue";
      this._rescueT = 0;
      // bounce
      this.fallVel = -8;
    }
  }

  _tickRescue(dt) {
    this._rescueT += dt;
    // little bounce
    this.worker.position.y += this.fallVel * dt;
    this.fallVel += 40 * dt;
    if (this.worker.position.y < 1.0) {
      this.worker.position.y = 1.0;
      this.fallVel *= -0.45;
      if (Math.abs(this.fallVel) < 1) this.fallVel = 0;
    }
    this.worker.rotation.x *= 0.9;
    this.worker.rotation.z *= 0.9;

    const cam = new THREE.Vector3(
      this.worker.position.x + 2,
      3.5,
      this.worker.position.z + 6
    );
    this.camera.position.lerp(cam, 1 - Math.pow(0.01, dt));
    this.camera.lookAt(this.worker.position);

    if (this._rescueT > 1.1) {
      this.mode = "done";
      this.hooks.onFall?.(this.fallUV || this.path[this.path.length - 1].uv);
    }
  }

  _onResize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || 420;
    const h = parent?.clientHeight || 780;
    this.canvas.width = w * (window.devicePixelRatio > 1.5 ? 1.5 : 1);
    // let CSS size the canvas; set drawing buffer
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
