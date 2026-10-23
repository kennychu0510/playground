import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { COURT, serviceBoxCenter, playerEyeForServe, type ServeSide } from './game/court'
import { store } from './game/store'
import { planReturn } from './game/bots'

await RAPIER.init()

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!
const aimUi = document.querySelector<HTMLDivElement>('#aim-ui')!
const crosshair = document.querySelector<HTMLDivElement>('#crosshair')!
const btnServe = document.querySelector<HTMLButtonElement>('#btn-serve')!
const scoreEl = document.querySelector<HTMLSpanElement>('#score')!
const serveSideEl = document.querySelector<HTMLSelectElement>('#serve-side')!

const powerSlider = document.getElementById('power-slider') as HTMLInputElement
const powerVal = document.getElementById('power-val') as HTMLSpanElement
const powerFillEl = document.getElementById('power-fill') as HTMLDivElement
const btnHit = document.getElementById('btn-hit') as HTMLButtonElement
const aimHintEl = document.getElementById('aim-hint') as HTMLParagraphElement

serveSideEl.value = store.getState().serveSide

function syncHud() {
  const s = store.getState()
  bannerEl.textContent = s.banner
  bannerEl.classList.toggle('hidden', !s.banner)
  scoreEl.textContent = s.scorePlayer + ' – ' + s.scoreBot
  const aiming = s.phase === 'serveAim' || s.phase === 'playerAim'
  aimUi.classList.toggle('hidden', !aiming)
  crosshair.classList.toggle('hidden', !aiming)
  btnHit.disabled = !aiming
  powerSlider.disabled = !aiming
  const pct = Math.round(s.power * 100)
  powerFillEl.style.width = pct + '%'
  powerVal.textContent = pct + '%'
  powerSlider.value = String(pct)
  if (aiming) {
    aimHintEl.textContent =
      s.phase === 'serveAim'
        ? 'Serve · Drag to look · set power · Hit (above service line)'
        : 'Drag to look · set power · Hit'
  }
}
store.subscribe(syncHud)
store.getState().setPower(0.55)
syncHud()

powerSlider.addEventListener('input', () => {
  const p = parseInt(powerSlider.value, 10) / 100
  store.getState().setPower(p)
  powerFillEl.style.width = powerSlider.value + '%'
  powerVal.textContent = powerSlider.value + '%'
})

// --- Three ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b1220)
scene.fog = new THREE.Fog(0x0b1220, 14, 32)

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 40)

const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x1a2030, 0.9)
scene.add(hemi)
const key = new THREE.DirectionalLight(0xffffff, 1.0)
key.position.set(2.5, 7, 5)
key.castShadow = true
scene.add(key)

const courtGroup = new THREE.Group()
scene.add(courtGroup)

const WALL_WHITE = 0xffffff
const TIN_GREY = 0x9aa3b2
const FLOOR_COL = 0x2a3348
const LINE_RED = 0xff1a1a

function addWall(w: number, h: number, d: number, x: number, y: number, z: number, color: number, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.88, metalness: 0.02, transparent: opacity < 1, opacity,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.receiveShadow = true
  courtGroup.add(mesh)
  return mesh
}

const W = COURT.width
const L = COURT.length
const tin = COURT.tin
const shortZ = COURT.shortLineZ

// Floor
addWall(W, 0.08, L, 0, -0.04, L / 2, FLOOR_COL)
// Front wall (above tin) — white
addWall(W, COURT.frontHeight - tin, 0.12, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, WALL_WHITE)
// Tin — darker grey for contrast
addWall(W, tin, 0.14, 0, tin / 2, 0.07, TIN_GREY)
// Side walls — white
addWall(0.12, COURT.sideHeight, L, -W / 2, COURT.sideHeight / 2, L / 2, WALL_WHITE, 0.95)
addWall(0.12, COURT.sideHeight, L, W / 2, COURT.sideHeight / 2, L / 2, WALL_WHITE, 0.95)
// Back wall — white
addWall(W, COURT.backHeight, 0.12, 0, COURT.backHeight / 2, L - 0.06, WALL_WHITE, 0.92)

// Court lines — bright red
function boxOutline(x0: number, x1: number, z0: number, z1: number) {
  const mat = new THREE.LineBasicMaterial({ color: LINE_RED })
  const pts = [
    new THREE.Vector3(x0, 0.02, z0), new THREE.Vector3(x1, 0.02, z0),
    new THREE.Vector3(x1, 0.02, z1), new THREE.Vector3(x0, 0.02, z1),
    new THREE.Vector3(x0, 0.02, z0),
  ]
  courtGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
}
boxOutline(-W / 2, 0, shortZ, L)
boxOutline(0, W / 2, shortZ, L)

const lineMat = new THREE.LineBasicMaterial({ color: LINE_RED })
function line(a: THREE.Vector3, b: THREE.Vector3) {
  courtGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat))
}
line(new THREE.Vector3(-W / 2, 0.015, shortZ), new THREE.Vector3(W / 2, 0.015, shortZ))
line(new THREE.Vector3(0, 0.015, shortZ), new THREE.Vector3(0, 0.015, L))
line(new THREE.Vector3(-W / 2, COURT.serviceLineY, 0.14), new THREE.Vector3(W / 2, COURT.serviceLineY, 0.14))

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(COURT.ballRadius * 2.4, 20, 16),
  new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }),
)
ballMesh.castShadow = true
scene.add(ballMesh)

const aimMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0x3ecf8e }),
)
aimMarker.visible = false
scene.add(aimMarker)

// --- Look (yaw/pitch) — separate from aim ---
const look = {
  yaw: 0, // 0 = facing -Z (toward front wall from back)
  pitch: -0.12,
}
const LOOK_SENS = 0.0045
const PITCH_MIN = -1.15
const PITCH_MAX = 0.85

function applyLook() {
  const cy = Math.cos(look.yaw)
  const sy = Math.sin(look.yaw)
  const cp = Math.cos(look.pitch)
  const sp = Math.sin(look.pitch)
  // Forward in XZ: toward front wall is -Z when yaw=0
  const fx = -sy * cp
  const fy = sp
  const fz = -cy * cp
  const target = new THREE.Vector3(
    camera.position.x + fx,
    camera.position.y + fy,
    camera.position.z + fz,
  )
  camera.lookAt(target)
}

function lookToward(worldPoint: THREE.Vector3) {
  const dx = worldPoint.x - camera.position.x
  const dy = worldPoint.y - camera.position.y
  const dz = worldPoint.z - camera.position.z
  look.yaw = Math.atan2(-dx, -dz)
  const horiz = Math.hypot(dx, dz)
  look.pitch = Math.atan2(dy, Math.max(0.01, horiz))
  look.pitch = THREE.MathUtils.clamp(look.pitch, PITCH_MIN, PITCH_MAX)
  applyLook()
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Smooth look at a world point (no snap). */
function lookTowardSmooth(worldPoint: THREE.Vector3, t: number) {
  const dx = worldPoint.x - camera.position.x
  const dy = worldPoint.y - camera.position.y
  const dz = worldPoint.z - camera.position.z
  const yaw = Math.atan2(-dx, -dz)
  const horiz = Math.hypot(dx, dz)
  const pitch = THREE.MathUtils.clamp(
    Math.atan2(dy, Math.max(0.01, horiz)),
    PITCH_MIN,
    PITCH_MAX,
  )
  look.yaw = lerpAngle(look.yaw, yaw, t)
  look.pitch = THREE.MathUtils.lerp(look.pitch, pitch, t)
  applyLook()
}

// --- Physics ---
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
world.timestep = 1 / 60

const REST_MAX = RAPIER.CoefficientCombineRule.Max

function wallCollider(hx: number, hy: number, hz: number, x: number, y: number, z: number, rest: number, fric: number) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(rest)
      .setFriction(fric)
      .setRestitutionCombineRule(REST_MAX),
    body,
  )
}

// Floor: lively squash bounce (not sky rockets — tameBall caps)
wallCollider(W / 2, 0.04, L / 2, 0, -0.04, L / 2, 0.48, 0.7)
// Front / sides / back — punchy wall rebound
wallCollider(W / 2, (COURT.frontHeight - tin) / 2, 0.06, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 0.92, 0.25)
wallCollider(W / 2, tin / 2, 0.07, 0, tin / 2, 0.07, 0.15, 0.95)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, -W / 2, COURT.sideHeight / 2, L / 2, 0.88, 0.3)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, W / 2, COURT.sideHeight / 2, L / 2, 0.88, 0.3)
wallCollider(W / 2, COURT.backHeight / 2, 0.06, 0, COURT.backHeight / 2, L - 0.06, 0.85, 0.35)

const ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, L - 2)
    .setLinearDamping(0.06)
    .setAngularDamping(0.35)
    .setCcdEnabled(true)
    .setCanSleep(true),
)
const ballCollider = world.createCollider(
  RAPIER.ColliderDesc.ball(COURT.ballRadius)
    .setRestitution(0.78)
    .setFriction(0.35)
    .setDensity(28)
    .setRestitutionCombineRule(REST_MAX),
  ballBody,
)

function resetBall(x: number, y: number, z: number) {
  ballBody.setTranslation({ x, y, z }, true)
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
}

/** Keep ball restitution stable; only tame crazy floor launches. */
function tameBall() {
  // Keep wall-friendly restitution (Max combine uses wall when higher)
  ballCollider.setRestitution(0.78)

  const v = ballBody.linvel()
  const t = ballBody.translation()
  // Near floor: never allow huge upward rebound
  if (t.y < COURT.ballRadius + 0.12 && v.y > 5.5) {
    ballBody.setLinvel({ x: v.x * 0.97, y: Math.min(v.y, 4.0), z: v.z * 0.97 }, true)
  }
  if (v.y > 14) {
    ballBody.setLinvel({ x: v.x, y: 9, z: v.z }, true)
  }
  if (t.y > COURT.frontHeight + 0.4) {
    ballBody.setLinvel({ x: v.x * 0.5, y: -Math.abs(v.y) * 0.3, z: v.z * 0.5 }, true)
  }
}

// Front-wall plane for aim (inner face ~ z = 0.12)
const FRONT_AIM_Z = 0.12

function aimWorldTarget(): THREE.Vector3 {
  // Ray from camera through screen center
  const ndc = new THREE.Vector2(0, 0)
  const ray = new THREE.Raycaster()
  ray.setFromCamera(ndc, camera)
  const origin = ray.ray.origin
  const dir = ray.ray.direction.clone()
  // Intersect plane z = FRONT_AIM_Z
  let hit: THREE.Vector3
  if (Math.abs(dir.z) < 1e-5) {
    hit = new THREE.Vector3(0, 1.5, FRONT_AIM_Z)
  } else {
    const t = (FRONT_AIM_Z - origin.z) / dir.z
    if (t < 0.05) {
      // Looking away from front — fall back along look forward projected
      hit = new THREE.Vector3(
        camera.position.x - Math.sin(look.yaw) * 4,
        camera.position.y + Math.sin(look.pitch) * 2,
        FRONT_AIM_Z,
      )
    } else {
      hit = origin.clone().addScaledVector(dir, t)
    }
  }
  const margin = 0.25
  hit.x = THREE.MathUtils.clamp(hit.x, -W / 2 + margin, W / 2 - margin)
  const yMin = store.getState().phase === 'serveAim' ? COURT.serviceLineY + 0.05 : tin + 0.2
  const yMax = COURT.frontHeight - 0.25
  hit.y = THREE.MathUtils.clamp(hit.y, yMin, yMax)
  hit.z = FRONT_AIM_Z
  return hit
}

function updateAimMarker() {
  const aiming = store.getState().phase === 'serveAim' || store.getState().phase === 'playerAim'
  aimMarker.visible = aiming
  if (aiming) aimMarker.position.copy(aimWorldTarget())
}

function setCameraServe(side: ServeSide) {
  const eye = playerEyeForServe(side)
  camera.position.set(eye.x, eye.y, eye.z)
  // Default look toward opposite front quarter above service line
  const tx = side === 'right' ? -W * 0.22 : W * 0.22
  lookToward(new THREE.Vector3(tx, COURT.serviceLineY + 0.35, FRONT_AIM_Z))
}

let lookingDrag = false
let lastPx = 0
let lastPy = 0

/**
 * Continuous chase cam: stays behind the ball toward the back wall,
 * damps position + look so rallies have no jumps/cuts.
 */
function setCameraRally(dt: number) {
  if (lookingDrag) return
  const t = ballBody.translation()
  // Behind the ball (higher z), slightly offset toward center
  const desired = new THREE.Vector3(
    THREE.MathUtils.clamp(t.x * 0.45, -1.8, 1.8),
    THREE.MathUtils.clamp(1.35 + t.y * 0.15, 1.35, 2.05),
    THREE.MathUtils.clamp(t.z + 2.15, 2.2, L - 0.4),
  )
  // Keep a little distance if ball is deep near camera
  if (desired.z - t.z < 1.4) desired.z = Math.min(L - 0.4, t.z + 1.4)
  const k = 1 - Math.exp(-3.2 * dt) // frame-rate independent ease
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, desired.x, k)
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, desired.y, k)
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, desired.z, k)
  const lookAt = new THREE.Vector3(t.x, Math.max(0.55, t.y), t.z)
  lookTowardSmooth(lookAt, k)
}

let isServing = false
let pendingBot = false
let botTimer = 0
let botPlan: ReturnType<typeof planReturn> | null = null
let armPlayer = false
let hitFrontOnServe = false
/** After a legal serve bounce off the front wall, bot should return the rebound. */
let awaitServeReturn = false
/** Frames the ball has been nearly stopped on the floor (anti-flicker for "Ball died"). */
let deadFrames = 0

function enterAim(kind: 'serveAim' | 'playerAim') {
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
  store.getState().setPhase(kind)
  store.getState().setBanner(kind === 'serveAim' ? 'Serve from the service box' : 'Your shot')
  // Do NOT teleport the camera on player aim — keep the continuous rally follow pose
  updateAimMarker()
  syncHud()
}

/** Lob serve: ballistic arc to the front-wall aim point (must clear service line). */
function serveLaunchVel(from: { x: number; y: number; z: number }, target: THREE.Vector3, power: number) {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const horiz = Math.hypot(dx, dz)
  // Soft lob at low power, firmer at high — flight time ~0.45–0.85s
  const flight = THREE.MathUtils.clamp(0.85 - power * 0.4, 0.42, 0.9)
  const g = 9.81
  let vx = dx / flight
  let vz = dz / flight
  // Hit aim point near apex of the lob so it arrives high on the front wall
  let vy = (target.y - from.y) / flight + 0.5 * g * flight
  // Cap horizontal so it doesn't laser; keep a squash-like lob feel
  const hSpeed = Math.hypot(vx, vz)
  const maxH = 6 + power * 10 // ~7.5–16 m/s horizontal
  if (hSpeed > maxH && hSpeed > 1e-6) {
    const s = maxH / hSpeed
    vx *= s
    vz *= s
    // Recompute loft for the stretched time to cover same distance
    const flight2 = horiz / maxH
    vy = (target.y - from.y) / flight2 + 0.5 * g * flight2
  }
  // Always some loft on serve
  vy = Math.max(vy, 2.2 + (1 - power) * 2.5)
  return { x: vx, y: vy, z: vz }
}

function rallyLaunchVel(from: { x: number; y: number; z: number }, target: THREE.Vector3, power: number) {
  const dir = new THREE.Vector3(target.x - from.x, target.y - from.y, target.z - from.z)
  if (dir.lengthSq() < 1e-6) dir.set(0, 0.15, -1)
  dir.normalize()
  // Drive: flatter, punchier than serve lob
  const speed = 9 + power * 14
  // Slight loft so it clears tin without sky rockets
  const y = Math.max(dir.y * speed, 1.2 + power * 1.5)
  return { x: dir.x * speed, y, z: dir.z * speed }
}

function doHit() {
  const phase = store.getState().phase
  if (phase !== 'serveAim' && phase !== 'playerAim') return
  const power = Math.max(0.15, store.getState().power)
  const target = aimWorldTarget()
  const from = ballBody.translation()
  // Nudge ball up a touch as if tossed into the strike
  if (phase === 'serveAim') {
    ballBody.setTranslation({ x: from.x, y: Math.max(from.y, 1.28), z: from.z }, true)
  }
  const pos = ballBody.translation()
  const vel = phase === 'serveAim'
    ? serveLaunchVel(pos, target, power)
    : rallyLaunchVel(pos, target, power)
  ballBody.wakeUp()
  ballBody.setLinvel(vel, true)
  aimMarker.visible = false
  store.getState().setBanner('')
  store.getState().setPhase('rally')
  if (phase === 'serveAim') {
    isServing = true
    hitFrontOnServe = false
    awaitServeReturn = false
    pendingBot = true
  } else {
    pendingBot = true
  }
  deadFrames = 0
  botTimer = 0
  botPlan = null
}

btnHit.addEventListener('click', (e) => {
  e.preventDefault()
  e.stopPropagation()
  doHit()
})

function serve() {
  const side = store.getState().serveSide
  const box = serviceBoxCenter(side)
  resetBall(box.x, box.y, box.z)
  isServing = true
  pendingBot = false
  armPlayer = false
  hitFrontOnServe = false
  awaitServeReturn = false
  deadFrames = 0
  setCameraServe(side)
  enterAim('serveAim')
}

btnServe.addEventListener('click', () => serve())

/** Immediately preview the selected service box (no Serve click needed). */
function applyServeSide(side: ServeSide) {
  store.getState().setServeSide(side)
  const phase = store.getState().phase
  const preview =
    phase === 'idle' || phase === 'pointOver' || phase === 'serveAim'
  if (!preview) return

  const box = serviceBoxCenter(side)
  resetBall(box.x, box.y, box.z)
  isServing = true
  pendingBot = false
  armPlayer = false
  hitFrontOnServe = false
  awaitServeReturn = false
  deadFrames = 0
  setCameraServe(side) // resets look toward front for that side
  enterAim('serveAim')
}

serveSideEl.addEventListener('change', () => {
  applyServeSide(serveSideEl.value as ServeSide)
})

// Drag on canvas = LOOK AROUND only (yaw/pitch)
canvas.addEventListener('pointerdown', (e) => {
  lookingDrag = true
  lastPx = e.clientX
  lastPy = e.clientY
  canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
  if (!lookingDrag) return
  const dx = e.clientX - lastPx
  const dy = e.clientY - lastPy
  lastPx = e.clientX
  lastPy = e.clientY
  look.yaw -= dx * LOOK_SENS
  look.pitch -= dy * LOOK_SENS
  look.pitch = THREE.MathUtils.clamp(look.pitch, PITCH_MIN, PITCH_MAX)
  applyLook()
  const p = store.getState().phase
  if (p === 'serveAim' || p === 'playerAim') updateAimMarker()
})
canvas.addEventListener('pointerup', (e) => {
  lookingDrag = false
  try { canvas.releasePointerCapture(e.pointerId) } catch { /* */ }
})
canvas.addEventListener('pointercancel', () => { lookingDrag = false })

function endPoint(msg: string, toBot: boolean) {
  store.getState().setPhase('pointOver')
  if (toBot) store.getState().addPointBot()
  else store.getState().addPointPlayer()
  store.getState().setBanner(msg + ' · ' + store.getState().scorePlayer + '–' + store.getState().scoreBot + ' · Serve')
  pendingBot = false
  armPlayer = false
  isServing = false
  awaitServeReturn = false
  deadFrames = 0
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
  syncHud()
}

function checkPoint() {
  const t = ballBody.translation()
  const v = ballBody.linvel()
  const speed = Math.hypot(v.x, v.y, v.z)
  if (t.y < -0.4 || t.z < -0.8 || t.z > L + 0.8 || Math.abs(t.x) > W / 2 + 0.8) {
    endPoint('Out', true)
    return
  }
  if (t.z < 0.28 && t.y < tin && speed > 0.8) {
    endPoint('Tin!', true)
    return
  }
  // Front-wall contact during serve (near front, above tin)
  if (isServing && t.z < 0.4 && t.y >= tin && Math.abs(v.z) > 0.5) {
    hitFrontOnServe = true
    isServing = false
    awaitServeReturn = true
  }
  if (isServing && t.y < COURT.ballRadius + 0.05 && t.z > 0.5 && !hitFrontOnServe) {
    endPoint('Fault — serve must hit front wall first', true)
    return
  }
  // Don't call "Ball died" while serve is in flight or waiting for the bot return
  // Protect while serve in flight or waiting for the live bot return — not after
  const protect =
    isServing || awaitServeReturn || (pendingBot && !armPlayer) || store.getState().phase !== 'rally'
  if (protect) {
    deadFrames = 0
    return
  }
  // Require ~0.5s nearly stopped on the floor (not a one-frame dip after a bounce)
  if (t.y < COURT.ballRadius + 0.06 && speed < 0.35) {
    deadFrames++
    if (deadFrames > 30) endPoint('Ball died', true)
  } else {
    deadFrames = 0
  }
}

/** Live bot strike — never freezes the ball; only the player aim phase pauses. */
function botStrikeVel(
  from: { x: number; y: number; z: number },
  plan: NonNullable<typeof botPlan>,
) {
  const target = new THREE.Vector3(plan.target.x, plan.target.y, plan.target.z)
  if (plan.kind === 'lob') return serveLaunchVel(from, target, Math.min(0.85, plan.power))
  return rallyLaunchVel(from, target, plan.power)
}

function tryBot(dt: number) {
  if (!pendingBot || store.getState().phase !== 'rally') return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  const towardFront = t.z < shortZ + 0.4 && t.z > 0.35 && v.z < -0.2 && t.y < 2.8
  const serveRebound =
    awaitServeReturn &&
    hitFrontOnServe &&
    v.z > 0.15 &&
    t.z > 0.5 &&
    t.z < shortZ + 2.5 &&
    t.y > COURT.ballRadius + 0.02
  if (!towardFront && !serveRebound) {
    botTimer = 0
    return
  }

  const bot = store.getState().bot
  botTimer += dt
  if (botTimer < bot.reaction) return

  // Hit in motion — no sleep / no telegraph pause
  const plan = planReturn(bot, t, { width: W, length: L, frontHeight: COURT.frontHeight, tin })
  botPlan = plan
  const vel = botStrikeVel(t, plan)
  // Soft blend with reverse of incoming so contact feels continuous
  const blend = 0.18
  ballBody.wakeUp()
  ballBody.setLinvel(
    {
      x: vel.x * (1 - blend) - v.x * blend * 0.35,
      y: vel.y,
      z: vel.z * (1 - blend) - v.z * blend * 0.35,
    },
    true,
  )
  store.getState().setBanner(bot.name + ' · ' + plan.kind)
  window.setTimeout(() => {
    if (store.getState().phase === 'rally' && store.getState().banner.startsWith(bot.name)) {
      store.getState().setBanner('')
    }
  }, 700)
  pendingBot = false
  awaitServeReturn = false
  botPlan = null
  botTimer = 0
  armPlayer = true
  deadFrames = 0
}

function maybePlayerAim() {
  if (!armPlayer || store.getState().phase !== 'rally') return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  // Pause only for your shot once the ball is deep in your half
  if (v.z > 0.35 && t.z > shortZ + 0.6 && t.z > L - 3.8 && t.y < 2.6) {
    armPlayer = false
    enterAim('playerAim')
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let acc = 0
const FIXED = 1 / 60
let last = performance.now()

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const phase = store.getState().phase

  if (phase === 'serveAim') {
    // Serve setup only: planted at the box; drag to look
    applyLook()
    updateAimMarker()
  } else if (phase === 'playerAim') {
    // Physics paused for your shot, but camera keeps soft-following the (frozen) ball — no cut
    setCameraRally(dt)
    updateAimMarker()
  } else if (phase === 'rally') {
    acc += dt
    while (acc >= FIXED) {
      world.step()
      tameBall()
      acc -= FIXED
    }
    checkPoint()
    tryBot(dt)
    maybePlayerAim()
    if (store.getState().phase === 'rally' || store.getState().phase === 'playerAim') {
      setCameraRally(dt)
    }
  } else {
    applyLook()
  }

  const bt = ballBody.translation()
  ballMesh.position.set(bt.x, bt.y, bt.z)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

setCameraServe('right')
store.getState().setPhase('idle')
store.getState().setBanner('Choose L/R box · Serve')
requestAnimationFrame(frame)
