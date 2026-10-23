import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { COURT, serviceBoxCenter, playerEyeForServe, type ServeSide } from './game/court'
import { store } from './game/store'
import { BOTS, planReturn } from './game/bots'

await RAPIER.init()

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!
const aimUi = document.querySelector<HTMLDivElement>('#aim-ui')!
const crosshair = document.querySelector<HTMLDivElement>('#crosshair')!
const botSelect = document.querySelector<HTMLSelectElement>('#bot-select')!
const botBadge = document.querySelector<HTMLSpanElement>('#bot-badge')!
const btnServe = document.querySelector<HTMLButtonElement>('#btn-serve')!
const scoreEl = document.querySelector<HTMLSpanElement>('#score')!
const serveSideEl = document.querySelector<HTMLSelectElement>('#serve-side')!

const powerSlider = document.getElementById('power-slider') as HTMLInputElement
const powerVal = document.getElementById('power-val') as HTMLSpanElement
const powerFillEl = document.getElementById('power-fill') as HTMLDivElement
const btnHit = document.getElementById('btn-hit') as HTMLButtonElement
const aimHintEl = document.getElementById('aim-hint') as HTMLParagraphElement

for (const b of BOTS) {
  const opt = document.createElement('option')
  opt.value = b.id
  opt.textContent = b.name
  botSelect.appendChild(opt)
}
botSelect.value = store.getState().botId
serveSideEl.value = store.getState().serveSide

function syncHud() {
  const s = store.getState()
  bannerEl.textContent = s.banner
  bannerEl.classList.toggle('hidden', !s.banner)
  botBadge.textContent = 'vs ' + s.bot.name
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
        ? 'Serve from the box · drag aim · set power · Hit (above service line)'
        : 'Drag to aim · set power · Hit'
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

function addWall(w: number, h: number, d: number, x: number, y: number, z: number, color: number, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0.02, transparent: opacity < 1, opacity,
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

addWall(W, 0.08, L, 0, -0.04, L / 2, 0x2a3348)
addWall(W, COURT.frontHeight - tin, 0.12, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 0xd8dee9)
addWall(W, tin, 0.14, 0, tin / 2, 0.07, 0x3a455c)
addWall(0.12, COURT.sideHeight, L, -W / 2, COURT.sideHeight / 2, L / 2, 0xc5ccd8, 0.9)
addWall(0.12, COURT.sideHeight, L, W / 2, COURT.sideHeight / 2, L / 2, 0xc5ccd8, 0.9)
addWall(W, COURT.backHeight, 0.12, 0, COURT.backHeight / 2, L - 0.06, 0xb7c0d0, 0.8)

// Service boxes (floor markers)
function boxOutline(x0: number, x1: number, z0: number, z1: number, color: number) {
  const mat = new THREE.LineBasicMaterial({ color })
  const pts = [
    new THREE.Vector3(x0, 0.02, z0), new THREE.Vector3(x1, 0.02, z0),
    new THREE.Vector3(x1, 0.02, z1), new THREE.Vector3(x0, 0.02, z1),
    new THREE.Vector3(x0, 0.02, z0),
  ]
  courtGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
}
boxOutline(-W / 2, 0, shortZ, L, 0x3ecf8e)
boxOutline(0, W / 2, shortZ, L, 0xf0b429)

const lineMat = new THREE.LineBasicMaterial({ color: 0xf0b429 })
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

// --- Physics: soft bounce, no sky launches ---
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
world.timestep = 1 / 60

function wallCollider(hx: number, hy: number, hz: number, x: number, y: number, z: number, rest: number, fric: number) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setRestitution(rest).setFriction(fric),
    body,
  )
}

// Floor: low restitution so it doesn't rocket upward
wallCollider(W / 2, 0.04, L / 2, 0, -0.04, L / 2, 0.28, 0.85)
wallCollider(W / 2, (COURT.frontHeight - tin) / 2, 0.06, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 0.55, 0.4)
wallCollider(W / 2, tin / 2, 0.07, 0, tin / 2, 0.07, 0.15, 0.9)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, -W / 2, COURT.sideHeight / 2, L / 2, 0.5, 0.45)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, W / 2, COURT.sideHeight / 2, L / 2, 0.5, 0.45)
wallCollider(W / 2, COURT.backHeight / 2, 0.06, 0, COURT.backHeight / 2, L - 0.06, 0.45, 0.5)

const ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, L - 2)
    .setLinearDamping(0.35)
    .setAngularDamping(0.4)
    .setCcdEnabled(true)
    .setCanSleep(true),
)
const ballCollider = world.createCollider(
  RAPIER.ColliderDesc.ball(COURT.ballRadius)
    .setRestitution(0.35)
    .setFriction(0.55)
    .setDensity(120),
  ballBody,
)

function resetBall(x: number, y: number, z: number) {
  ballBody.setTranslation({ x, y, z }, true)
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
}

/** Clamp restitution & kill crazy upward speed after floor hits. */
function tameBall() {
  const v = ballBody.linvel()
  const speed = Math.hypot(v.x, v.y, v.z)
  // Softer bounce at higher speed (squash-like)
  const e = Math.max(0.18, Math.min(0.42, 0.4 - 0.006 * Math.min(speed, 30)))
  ballCollider.setRestitution(e)

  const t = ballBody.translation()
  // Near floor: never allow huge upward rebound
  if (t.y < COURT.ballRadius + 0.08 && v.y > 4.5) {
    ballBody.setLinvel({ x: v.x * 0.85, y: Math.min(v.y, 2.2), z: v.z * 0.85 }, true)
  }
  // Hard ceiling clamp (safety)
  if (v.y > 12) {
    ballBody.setLinvel({ x: v.x, y: 8, z: v.z }, true)
  }
  if (t.y > COURT.frontHeight + 0.5) {
    ballBody.setLinvel({ x: v.x * 0.5, y: -Math.abs(v.y) * 0.3, z: v.z * 0.5 }, true)
  }
}

// --- Aim ---
const aim = { nx: 0.55, ny: 0.42 }

function aimWorldTarget() {
  const x = (aim.nx - 0.5) * (W - 0.5)
  let y = tin + 0.25 + aim.ny * (COURT.frontHeight - tin - 0.55)
  if (store.getState().phase === 'serveAim') {
    y = Math.max(y, COURT.serviceLineY + 0.05)
  }
  return new THREE.Vector3(x, y, 0.12)
}

function updateAimMarker() {
  const aiming = store.getState().phase === 'serveAim' || store.getState().phase === 'playerAim'
  aimMarker.visible = aiming
  if (aiming) aimMarker.position.copy(aimWorldTarget())
}

function setCameraServe(side: ServeSide) {
  const eye = playerEyeForServe(side)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.lookAt(0, 1.45, 0)
}

function setCameraRally() {
  const t = ballBody.translation()
  const desired = new THREE.Vector3(
    THREE.MathUtils.clamp(t.x * 0.25, -1.4, 1.4),
    1.55,
    THREE.MathUtils.clamp(t.z + 1.6, shortZ + 0.2, L - 0.55),
  )
  camera.position.lerp(desired, 0.08)
  camera.lookAt(t.x * 0.4, Math.max(0.9, t.y), t.z)
}

let isServing = false
let pendingBot = false
let botTimer = 0
let frozenBot = false
let botPlan: ReturnType<typeof planReturn> | null = null
let armPlayer = false
let hitFrontOnServe = false

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
    camera.lookAt(0, 1.35, 0)
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
  // Cap launch speed so floor bounce stays tame
  const speed = 7 + power * 16 // ~7–23 m/s
  ballBody.wakeUp()
  ballBody.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true)
  aimMarker.visible = false
  store.getState().setBanner('')
  store.getState().setPhase('rally')
  if (phase === 'serveAim') {
    isServing = true
    hitFrontOnServe = false
    pendingBot = true
  } else {
    pendingBot = true
  }
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
  setCameraServe(side)
  // Default aim toward opposite front quarter above service line
  aim.nx = side === 'right' ? 0.28 : 0.72
  aim.ny = 0.5
  enterAim('serveAim')
}

btnServe.addEventListener('click', () => serve())
botSelect.addEventListener('change', () => {
  store.getState().setBot(botSelect.value)
  store.getState().setBanner(store.getState().bot.name + ' — ' + store.getState().bot.blurb)
})
serveSideEl.addEventListener('change', () => {
  store.getState().setServeSide(serveSideEl.value as ServeSide)
})

// Drag = aim only (no charge)
let dragging = false
canvas.addEventListener('pointerdown', (e) => {
  const p = store.getState().phase
  if (p !== 'serveAim' && p !== 'playerAim') return
  dragging = true
  canvas.setPointerCapture(e.pointerId)
  aim.nx = Math.min(0.92, Math.max(0.08, e.clientX / innerWidth))
  aim.ny = Math.min(0.88, Math.max(0.08, 1 - e.clientY / innerHeight))
  updateAimMarker()
})
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return
  const p = store.getState().phase
  if (p !== 'serveAim' && p !== 'playerAim') return
  aim.nx = Math.min(0.92, Math.max(0.08, e.clientX / innerWidth))
  aim.ny = Math.min(0.88, Math.max(0.08, 1 - e.clientY / innerHeight))
  updateAimMarker()
})
canvas.addEventListener('pointerup', (e) => {
  dragging = false
  try { canvas.releasePointerCapture(e.pointerId) } catch { /* */ }
})
canvas.addEventListener('pointercancel', () => { dragging = false })

function endPoint(msg: string, toBot: boolean) {
  store.getState().setPhase('pointOver')
  if (toBot) store.getState().addPointBot()
  else store.getState().addPointPlayer()
  store.getState().setBanner(msg + ' · ' + store.getState().scorePlayer + '–' + store.getState().scoreBot + ' · Serve')
  pendingBot = false
  armPlayer = false
  frozenBot = false
  isServing = false
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
  // Serve must hit front wall first
  if (isServing && t.z < 0.35 && t.y >= tin) {
    hitFrontOnServe = true
    isServing = false
  }
  if (isServing && t.y < COURT.ballRadius + 0.05 && t.z > 0.5 && !hitFrontOnServe) {
    endPoint('Fault — serve must hit front wall first', true)
    return
  }
  if (t.y < COURT.ballRadius + 0.04 && speed < 0.45 && store.getState().phase === 'rally') {
    endPoint('Ball died', false)
  }
}

function tryBot(dt: number) {
  if (!pendingBot || store.getState().phase !== 'rally' && store.getState().phase !== 'botTelegraph') return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  const towardBot = t.z < shortZ - 0.15 && v.z < -0.4
  if (!towardBot && !frozenBot) return

  const bot = store.getState().bot
  botTimer += dt
  if (!frozenBot) {
    if (botTimer < bot.reaction) return
    frozenBot = true
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ballBody.sleep()
    botPlan = planReturn(bot, t, { width: W, length: L, frontHeight: COURT.frontHeight, tin })
    store.getState().setPhase('botTelegraph')
    store.getState().setBanner(bot.name + ' · ' + botPlan.kind)
    botTimer = 0
    return
  }
  if (botTimer < 0.4) return
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
    }
    tryBot(dt)
    maybePlayerAim()
  }

  const bt = ballBody.translation()
  ballMesh.position.set(bt.x, bt.y, bt.z)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

setCameraServe('right')
store.getState().setPhase('idle')
store.getState().setBanner('Pick opponent · choose L/R box · Serve')
requestAnimationFrame(frame)
