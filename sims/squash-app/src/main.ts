import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { COURT } from './game/court'
import { store } from './game/store'
import { BOTS, planReturn } from './game/bots'

await RAPIER.init()

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!
const aimUi = document.querySelector<HTMLDivElement>('#aim-ui')!
const powerFill = document.querySelector<HTMLDivElement>('#power-fill')!
const crosshair = document.querySelector<HTMLDivElement>('#crosshair')!
const botSelect = document.querySelector<HTMLSelectElement>('#bot-select')!
const botBadge = document.querySelector<HTMLSpanElement>('#bot-badge')!
const btnServe = document.querySelector<HTMLButtonElement>('#btn-serve')!

for (const b of BOTS) {
  const opt = document.createElement('option')
  opt.value = b.id
  opt.textContent = b.name
  botSelect.appendChild(opt)
}
botSelect.value = store.getState().botId

function syncHud() {
  const s = store.getState()
  bannerEl.textContent = s.banner
  bannerEl.classList.toggle('hidden', !s.banner)
  botBadge.textContent = 'vs ' + s.bot.name
  const aiming = s.phase === 'playerAim'
  aimUi.classList.toggle('hidden', !aiming)
  crosshair.classList.toggle('hidden', !aiming)
  powerFill.style.width = Math.round(s.power * 100) + '%'
}

store.subscribe(syncHud)
syncHud()

// --- Three scene ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b1220)
scene.fog = new THREE.Fog(0x0b1220, 12, 28)

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 40)
const playerEye = new THREE.Vector3(0, 1.55, COURT.length - 1.15)
camera.position.copy(playerEye)
camera.lookAt(0, 1.4, 0)

const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x1a2030, 0.85)
scene.add(hemi)
const key = new THREE.DirectionalLight(0xffffff, 1.05)
key.position.set(2, 6, 4)
key.castShadow = true
scene.add(key)

const courtGroup = new THREE.Group()
scene.add(courtGroup)

function addWall(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  opacity = 1,
) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
  })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.receiveShadow = true
  mesh.castShadow = true
  courtGroup.add(mesh)
  return mesh
}

const W = COURT.width
const L = COURT.length
const tin = COURT.tin

// Floor
addWall(W, 0.08, L, 0, -0.04, L / 2, 0x2a3348)
// Front wall (above tin)
addWall(W, COURT.frontHeight - tin, 0.12, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 0xd8dee9)
// Tin (out)
addWall(W, tin, 0.14, 0, tin / 2, 0.07, 0x3a455c)
// Side walls
addWall(0.12, COURT.sideHeight, L, -W / 2, COURT.sideHeight / 2, L / 2, 0xc5ccd8, 0.92)
addWall(0.12, COURT.sideHeight, L, W / 2, COURT.sideHeight / 2, L / 2, 0xc5ccd8, 0.92)
// Back wall (short)
addWall(W, COURT.backHeight, 0.12, 0, COURT.backHeight / 2, L - 0.06, 0xb7c0d0, 0.85)

// Court lines (short line + service boxes rough)
const lineMat = new THREE.LineBasicMaterial({ color: 0xf0b429 })
function lineRect(points: THREE.Vector3[]) {
  const geo = new THREE.BufferGeometry().setFromPoints(points)
  courtGroup.add(new THREE.Line(geo, lineMat))
}
const shortZ = COURT.shortLineZ
lineRect([
  new THREE.Vector3(-W / 2, 0.01, shortZ),
  new THREE.Vector3(W / 2, 0.01, shortZ),
])
lineRect([
  new THREE.Vector3(0, 0.01, shortZ),
  new THREE.Vector3(0, 0.01, L),
])
// Service line on front wall
lineRect([
  new THREE.Vector3(-W / 2, COURT.serviceLineY, 0.14),
  new THREE.Vector3(W / 2, COURT.serviceLineY, 0.14),
])

// Ball mesh
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(COURT.ballRadius * 3.2, 24, 16), // visual scale up for readability
  new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55 }),
)
ballMesh.castShadow = true
scene.add(ballMesh)

// Aim ghost marker on front wall
const aimMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0x3ecf8e }),
)
aimMarker.visible = false
scene.add(aimMarker)

// --- Rapier world ---
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
const bodies: { wall: RAPIER.Collider; kind: string }[] = []

function wallCollider(
  hx: number,
  hy: number,
  hz: number,
  x: number,
  y: number,
  z: number,
  kind: string,
  restitution = 0.72,
  friction = 0.55,
) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(restitution)
      .setFriction(friction),
    body,
  )
  bodies.push({ wall: col, kind })
}

wallCollider(W / 2, 0.04, L / 2, 0, -0.04, L / 2, 'floor', 0.55, 0.7)
wallCollider(W / 2, (COURT.frontHeight - tin) / 2, 0.06, 0, tin + (COURT.frontHeight - tin) / 2, 0.06, 'front', 0.68)
wallCollider(W / 2, tin / 2, 0.07, 0, tin / 2, 0.07, 'tin', 0.2, 0.8)
wallCollider(0.06, COURT.sideHeight / 2, L / 2, -W / 2, COURT.sideHeight / 2, L / 2, 'side')
wallCollider(0.06, COURT.sideHeight / 2, L / 2, W / 2, COURT.sideHeight / 2, L / 2, 'side')
wallCollider(W / 2, COURT.backHeight / 2, 0.06, 0, COURT.backHeight / 2, L - 0.06, 'back', 0.6)

let ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 1.2, L - 2)
    .setLinearDamping(0.12)
    .setAngularDamping(0.2)
    .setCcdEnabled(true),
)
let ballCollider = world.createCollider(
  RAPIER.ColliderDesc.ball(COURT.ballRadius)
    .setRestitution(0.62)
    .setFriction(0.35)
    .setDensity(80),
  ballBody,
)

function resetBall(x: number, y: number, z: number) {
  ballBody.setTranslation({ x, y, z }, true)
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
}

function wakeBall() {
  ballBody.wakeUp()
}

/** Speed-dependent COR toy: e ≈ 0.47 − 0.0076 u (clamped). */
function tuneBallRestitution() {
  const v = ballBody.linvel()
  const speed = Math.hypot(v.x, v.y, v.z)
  const e = Math.max(0.22, Math.min(0.55, 0.47 - 0.0076 * Math.min(speed, 35)))
  ballCollider.setRestitution(e)
}

// --- Aim / input ---
const aim = {
  active: false,
  nx: 0.5,
  ny: 0.45,
  power: 0,
  charging: false,
  chargeStart: 0,
}

function aimWorldTarget() {
  // Map normalized aim to front wall above tin
  const x = (aim.nx - 0.5) * (W - 0.6)
  const y = tin + 0.2 + aim.ny * (COURT.frontHeight - tin - 0.5)
  return new THREE.Vector3(x, y, 0.12)
}

function updateAimMarker() {
  const t = aimWorldTarget()
  aimMarker.position.copy(t)
  aimMarker.visible = store.getState().phase === 'playerAim'
}

function enterPlayerAim() {
  // Freeze ball near player strike zone
  const t = ballBody.translation()
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
  aim.active = true
  aim.power = 0
  aim.charging = false
  store.getState().setPower(0)
  store.getState().setPhase('playerAim')
  store.getState().setBanner('Aim · hold to charge · release to hit')
  camera.position.set(t.x * 0.15, 1.55, Math.min(L - 0.9, Math.max(shortZ + 0.5, t.z + 0.35)))
  camera.lookAt(0, 1.35, 0)
}

function strikeBall() {
  const target = aimWorldTarget()
  const from = ballBody.translation()
  const dir = new THREE.Vector3(target.x - from.x, target.y - from.y, target.z - from.z).normalize()
  const power = Math.max(0.2, aim.power)
  const speed = 8 + power * 22 // ~8–30 m/s
  wakeBall()
  ballBody.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true)
  store.getState().setPhase('playerSwing')
  store.getState().setBanner('')
  aim.active = false
  aimMarker.visible = false
  // After player hits, bot will respond when ball comes off front / into bot half
  pendingBot = true
  botTimer = 0
}

let pendingBot = false
let botTimer = 0
let botPlan: ReturnType<typeof planReturn> | null = null
let frozenForBot = false

function tryBotReturn(dt: number) {
  if (!pendingBot) return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  // Trigger when ball is past short line traveling toward back OR after front bounce slowed
  const comingToBot = t.z < shortZ - 0.2 && v.z < -0.5
  const deep = t.z < 3.2 && Math.hypot(v.x, v.y, v.z) < 14
  if (!comingToBot && !deep) return

  const bot = store.getState().bot
  botTimer += dt
  if (!frozenForBot) {
    if (botTimer < bot.reaction) return
    frozenForBot = true
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ballBody.sleep()
    botPlan = planReturn(bot, t, {
      width: W,
      length: L,
      frontHeight: COURT.frontHeight,
      tin,
    })
    store.getState().setPhase('botThink')
    store.getState().setBanner(bot.name + ' returns · ' + botPlan.kind)
    botTimer = 0
    return
  }

  // Brief telegraph then swing
  if (botTimer < 0.35) return
  const plan = botPlan!
  const from = ballBody.translation()
  const dir = new THREE.Vector3(
    plan.target.x - from.x,
    plan.target.y - from.y,
    plan.target.z - from.z,
  ).normalize()
  const speed = 9 + plan.power * 20
  wakeBall()
  ballBody.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true)
  store.getState().setPhase('rally')
  store.getState().setBanner('')
  pendingBot = false
  frozenForBot = false
  botPlan = null
  botTimer = 0
  // Next time ball approaches player, pause for aim
  armPlayerInterrupt = true
}

let armPlayerInterrupt = false
let playerArmTimer = 0

function maybePlayerInterrupt(dt: number) {
  if (!armPlayerInterrupt) return
  if (store.getState().phase === 'playerAim' || store.getState().phase === 'botThink') return
  const t = ballBody.translation()
  const v = ballBody.linvel()
  // Ball coming toward back court / player
  const towardPlayer = v.z > 0.8 && t.z > shortZ - 0.5
  if (!towardPlayer) return
  playerArmTimer += dt
  // Freeze a beat before "contact" when close to player
  if (t.z > L - 2.8 && t.y < 2.2 && playerArmTimer > 0.05) {
    armPlayerInterrupt = false
    playerArmTimer = 0
    enterPlayerAim()
  }
}

function serve() {
  pendingBot = false
  frozenForBot = false
  armPlayerInterrupt = false
  playerArmTimer = 0
  resetBall(1.1, 1.15, L - 1.6)
  store.getState().setPhase('serveReady')
  store.getState().setBanner('Your serve — aim the front wall')
  enterPlayerAim()
  // Serve: after hit, bot returns
}

btnServe.addEventListener('click', () => serve())
botSelect.addEventListener('change', () => {
  store.getState().setBot(botSelect.value)
  store.getState().setBanner('Opponent: ' + store.getState().bot.name + ' — ' + store.getState().bot.blurb)
})

// Pointer aim
let dragging = false
canvas.addEventListener('pointerdown', (e) => {
  if (store.getState().phase !== 'playerAim') return
  dragging = true
  canvas.setPointerCapture(e.pointerId)
  aim.nx = e.clientX / innerWidth
  aim.ny = 1 - e.clientY / innerHeight
  aim.charging = true
  aim.chargeStart = performance.now()
  updateAimMarker()
})
canvas.addEventListener('pointermove', (e) => {
  if (!dragging || store.getState().phase !== 'playerAim') return
  aim.nx = Math.min(0.92, Math.max(0.08, e.clientX / innerWidth))
  aim.ny = Math.min(0.9, Math.max(0.05, 1 - e.clientY / innerHeight))
  updateAimMarker()
})
function endPointer(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  try {
    canvas.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  if (store.getState().phase !== 'playerAim') return
  const held = (performance.now() - aim.chargeStart) / 1000
  // Power from hold time (0.15s→low, ~1.1s→full), swipe Soccer style
  aim.power = Math.min(1, Math.max(0.15, (held - 0.05) / 1.0))
  store.getState().setPower(aim.power)
  aim.charging = false
  strikeBall()
}
canvas.addEventListener('pointerup', endPointer)
canvas.addEventListener('pointercancel', endPointer)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// Point detection
function checkPoint() {
  const t = ballBody.translation()
  const v = ballBody.linvel()
  const speed = Math.hypot(v.x, v.y, v.z)
  if (t.y < -0.5 || t.z < -1 || t.z > L + 1 || Math.abs(t.x) > W / 2 + 1) {
    endPoint('Out of court')
    return
  }
  // Tin: ball center below tin height near front with outbound velocity
  if (t.z < 0.25 && t.y < tin && speed > 1) {
    endPoint('Tin!')
    return
  }
  // Second bounce floor heuristic: if very slow on floor mid-rally
  if (t.y < COURT.ballRadius + 0.03 && speed < 0.35 && store.getState().phase === 'rally') {
    endPoint('Ball died')
  }
}

function endPoint(msg: string) {
  store.getState().setPhase('pointOver')
  store.getState().setBanner(msg + ' — tap Serve')
  store.getState().setLastPoint(msg)
  pendingBot = false
  armPlayerInterrupt = false
  frozenForBot = false
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.sleep()
}

// Camera follow lightly in rally
function updateCamera() {
  const phase = store.getState().phase
  if (phase === 'playerAim') return
  const t = ballBody.translation()
  const look = new THREE.Vector3(t.x * 0.3, Math.max(0.8, t.y), t.z)
  const desired = new THREE.Vector3(
    THREE.MathUtils.clamp(t.x * 0.2, -1.2, 1.2),
    1.55,
    THREE.MathUtils.clamp(t.z + 1.8, shortZ, L - 0.7),
  )
  camera.position.lerp(desired, 0.06)
  const cur = new THREE.Vector3()
  camera.getWorldDirection(cur)
  const target = look.clone().sub(camera.position).normalize()
  const mixed = cur.lerp(target, 0.08)
  camera.lookAt(camera.position.clone().add(mixed))
}

let acc = 0
const FIXED = 1 / 60
let last = performance.now()

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (store.getState().phase === 'playerAim') {
    if (aim.charging) {
      const held = (now - aim.chargeStart) / 1000
      aim.power = Math.min(1, Math.max(0, (held - 0.05) / 1.0))
      store.getState().setPower(aim.power)
    }
    updateAimMarker()
  } else if (
    store.getState().phase === 'rally' ||
    store.getState().phase === 'playerSwing' ||
    store.getState().phase === 'botSwing' ||
    store.getState().phase === 'botThink'
  ) {
    if (store.getState().phase !== 'botThink' && store.getState().phase !== 'playerAim') {
      acc += dt
      while (acc >= FIXED) {
        tuneBallRestitution()
        world.step()
        acc -= FIXED
      }
    }
    tryBotReturn(dt)
    maybePlayerInterrupt(dt)
    checkPoint()
    updateCamera()
  }

  const bt = ballBody.translation()
  ballMesh.position.set(bt.x, bt.y, bt.z)

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

store.getState().setPhase('idle')
store.getState().setBanner('Pick an opponent, then Serve')
requestAnimationFrame(frame)
