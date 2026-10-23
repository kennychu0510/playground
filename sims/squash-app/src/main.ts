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
  new THREE.SphereGeometry(COURT.ballRadius * 3.5, 20, 16),
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

// Floor: soft so it doesn't rocket upward
wallCollider(W / 2, 0.04, L / 2, 0, -0.04, L / 2, 0.3, 0.85)
// Front wall / tin / sides / back — high restitution; Max combine so wall wins over ball
wallCollider(W / 2, (COURT.frontHeight - tin) / 2, 0.06, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 0.85, 0.35)
wallCollider(W / 2, tin / 2, 0.07, 0, tin / 2, 0.07, 0.2, 0.9)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, -W / 2, COURT.sideHeight / 2, L / 2, 0.8, 0.4)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, W / 2, COURT.sideHeight / 2, L / 2, 0.8, 0.4)
wallCollider(W / 2, COURT.backHeight / 2, 0.06, 0, COURT.backHeight / 2, L - 0.06, 0.75, 0.45)

const ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, L - 2)
    .setLinearDamping(0.28)
    .setAngularDamping(0.35)
    .setCcdEnabled(true)
    .setCanSleep(true),
)
const ballCollider = world.createCollider(
  RAPIER.ColliderDesc.ball(COURT.ballRadius)
    .setRestitution(0.65)
    .setFriction(0.5)
    .setDensity(120)
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
  ballCollider.setRestitution(0.65)

  const v = ballBody.linvel()
  const t = ballBody.translation()
  // Near floor: never allow huge upward rebound
  if (t.y < COURT.ballRadius + 0.1 && v.y > 3.5) {
    ballBody.setLinvel({ x: v.x * 0.9, y: Math.min(v.y, 2.0), z: v.z * 0.9 }, true)
  }
  if (v.y > 11) {
    ballBody.setLinvel({ x: v.x, y: 7, z: v.z }, true)
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

function setCameraRally() {
  if (lookingDrag) return // user is looking around — don't overwrite
  const t = ballBody.translation()
  const desired = new THREE.Vector3(
    THREE.MathUtils.clamp(t.x * 0.25, -1.4, 1.4),
    1.55,
    THREE.MathUtils.clamp(t.z + 1.6, shortZ + 0.2, L - 0.55),
  )
  camera.position.lerp(desired, 0.08)
  lookToward(new THREE.Vector3(t.x * 0.4, Math.max(0.9, t.y), t.z))
}

let isServing = false
let pendingBot = false
let botTimer = 0
let frozenBot = false
let botPlan: ReturnType<typeof planReturn> | null = null
let armPlayer = false
let hitFrontOnServe = false
/** After a legal serve bounce off the front wall, bot should return the rebound. */
let awaitServeReturn = false
/** Frames the ball has been nearly stopped on the floor (anti-flicker for "Ball died"). */
let deadFrames = 0

function enterAim(kind: 'serveAim' | 'playerAim') {
  const t = ballBody.translation()
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
  store.getState().setPhase(kind)
  store.getState().setBanner(kind === 'serveAim' ? 'Serve from the service box' : 'Your shot')
  if (kind === 'playerAim') {
    camera.position.set(
      THREE.MathUtils.clamp(t.x * 0.3, -1.5, 1.5),
      1.55,
      Math.min(L - 0.5, Math.max(shortZ + 0.4, t.z + 0.5)),
    )
    lookToward(new THREE.Vector3(0, 1.35, FRONT_AIM_Z))
  }
  updateAimMarker()
  syncHud()
}

function doHit() {
  const phase = store.getState().phase
  if (phase !== 'serveAim' && phase !== 'playerAim') return
  const power = Math.max(0.15, store.getState().power)
  const target = aimWorldTarget()
  const from = ballBody.translation()
  const dir = new THREE.Vector3(target.x - from.x, target.y - from.y, target.z - from.z)
  if (dir.lengthSq() < 1e-6) dir.set(0, 0.2, -1)
  dir.normalize()
  const speed = 7 + power * 16
  ballBody.wakeUp()
  ballBody.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true)
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
  frozenBot = false
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
  frozenBot = false
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
  frozenBot = false
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
  frozenBot = false
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
  const protect =
    isServing || awaitServeReturn || pendingBot || frozenBot || store.getState().phase !== 'rally'
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

function tryBot(dt: number) {
  if (!pendingBot || (store.getState().phase !== 'rally' && store.getState().phase !== 'botTelegraph')) return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  // Inbound to front (rally), or rebound after a legal serve hit the front wall
  const towardFront = t.z < shortZ - 0.1 && v.z < -0.35
  const serveRebound =
    awaitServeReturn && hitFrontOnServe && v.z > 0.25 && t.z > 0.45 && t.z < shortZ + 2.2
  if (!towardFront && !serveRebound && !frozenBot) return

  const bot = store.getState().bot
  botTimer += dt
  if (!frozenBot) {
    if (botTimer < bot.reaction) return
    frozenBot = true
    awaitServeReturn = false
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ballBody.sleep()
    botPlan = planReturn(bot, t, { width: W, length: L, frontHeight: COURT.frontHeight, tin })
    store.getState().setPhase('botTelegraph')
    store.getState().setBanner(bot.name + ' · ' + botPlan.kind)
    botTimer = 0
    return
  }
  if (botTimer < 0.35) return
  const plan = botPlan!
  const from = ballBody.translation()
  const dir = new THREE.Vector3(plan.target.x - from.x, plan.target.y - from.y, plan.target.z - from.z).normalize()
  const speed = 8 + plan.power * 14
  ballBody.wakeUp()
  ballBody.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true)
  store.getState().setPhase('rally')
  store.getState().setBanner('')
  pendingBot = false
  frozenBot = false
  botPlan = null
  botTimer = 0
  armPlayer = true
  deadFrames = 0
}

function maybePlayerAim() {
  if (!armPlayer || store.getState().phase !== 'rally') return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  if (v.z > 0.6 && t.z > shortZ && t.z > L - 3.2 && t.y < 2.4) {
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

  if (phase === 'serveAim' || phase === 'playerAim') {
    // Aim phases: do NOT auto-overwrite look from rally follow
    applyLook()
    updateAimMarker()
  } else if (phase === 'rally' || phase === 'botTelegraph') {
    if (phase === 'rally') {
      acc += dt
      while (acc >= FIXED) {
        world.step()
        tameBall()
        acc -= FIXED
      }
      checkPoint()
      setCameraRally()
    } else {
      applyLook()
    }
    tryBot(dt)
    maybePlayerAim()
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
