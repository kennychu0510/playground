import './style.css'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { HOOP_HOME, SCORE, STAGES, hoopOffset, type StageDef } from './game/stages'

await RAPIER.init()

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const bannerEl = document.querySelector<HTMLDivElement>('#banner')!
const stageLabelEl = document.querySelector<HTMLSpanElement>('#stage-label')!
const stageScoreEl = document.querySelector<HTMLSpanElement>('#stage-score')!
const timerEl = document.querySelector<HTMLSpanElement>('#timer')!
const streakEl = document.querySelector<HTMLSpanElement>('#streak')!
const totalScoreEl = document.querySelector<HTMLSpanElement>('#total-score')!
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!
const overlayEyebrow = document.querySelector<HTMLParagraphElement>('#overlay-eyebrow')!
const overlayTitle = document.querySelector<HTMLHeadingElement>('#overlay-title')!
const overlayBody = document.querySelector<HTMLParagraphElement>('#overlay-body')!
const overlayRules = document.querySelector<HTMLUListElement>('#overlay-rules')!
const btnPrimary = document.querySelector<HTMLButtonElement>('#btn-primary')!

const BALL_R = 0.12
const GRAVITY = -11.5
const SHOOT_POS = new THREE.Vector3(0, 1.15, 1.55)
const CAM_POS = new THREE.Vector3(0, 1.55, 3.35)
const CAM_LOOK = new THREE.Vector3(0, 2.1, -3.5)
const IMPULSE_SCALE = 0.95
const MIN_FLICK = 180
const MAX_FLICK = 1400
const UP_BIAS = 0.55
const FORWARD_BIAS = 1.15

const COL_RIM = 0x0001
const COL_BOARD = 0x0002
const COL_SENSOR = 0x0004
const COL_BALL = 0x0008

type Phase = 'title' | 'playing' | 'cleared' | 'failed' | 'won'

type GameState = {
  phase: Phase
  stageIndex: number
  stageScore: number
  totalScore: number
  streak: number
  timeLeft: number
  banner: string
  bannerKind: '' | 'make' | 'miss' | 'clear'
}

const state: GameState = {
  phase: 'title',
  stageIndex: 0,
  stageScore: 0,
  totalScore: 0,
  streak: 0,
  timeLeft: STAGES[0]!.duration,
  banner: 'Flick up to shoot · beat the clock',
  bannerKind: '',
}

function currentStage(): StageDef {
  return STAGES[state.stageIndex]!
}

function formatTime(s: number) {
  const t = Math.max(0, Math.ceil(s))
  const m = Math.floor(t / 60)
  const sec = t % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function syncHud() {
  const st = currentStage()
  stageLabelEl.textContent = `${st.id} · ${st.name}`
  stageScoreEl.textContent = `${state.stageScore} / ${st.goal}`
  timerEl.textContent = formatTime(state.timeLeft)
  timerEl.classList.toggle('urgent', state.phase === 'playing' && state.timeLeft <= 10)
  streakEl.textContent = String(state.streak)
  streakEl.classList.toggle('hot', state.streak >= 3)
  totalScoreEl.textContent = `Σ ${state.totalScore}`
  bannerEl.textContent = state.banner
  bannerEl.classList.toggle('hidden', !state.banner)
  bannerEl.classList.toggle('make', state.bannerKind === 'make')
  bannerEl.classList.toggle('miss', state.bannerKind === 'miss')
  bannerEl.classList.toggle('clear', state.bannerKind === 'clear')
}

let bannerClearAt = 0
function flashBanner(text: string, kind: GameState['bannerKind'], ms = 1400) {
  state.banner = text
  state.bannerKind = kind
  syncHud()
  bannerClearAt = performance.now() + ms
}

function showOverlay(opts: {
  eyebrow: string
  title: string
  body: string
  button: string
  rules?: boolean
}) {
  overlayEyebrow.textContent = opts.eyebrow
  overlayTitle.textContent = opts.title
  overlayBody.textContent = opts.body
  btnPrimary.textContent = opts.button
  overlayRules.style.display = opts.rules === false ? 'none' : ''
  overlayEl.classList.remove('hidden')
}

function hideOverlay() {
  overlayEl.classList.add('hidden')
}

// --- Three ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b1220)
scene.fog = new THREE.Fog(0x0b1220, 12, 28)

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 40)
camera.position.copy(CAM_POS)
camera.lookAt(CAM_LOOK)

scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x1a2030, 0.85))
const key = new THREE.DirectionalLight(0xffffff, 1.05)
key.position.set(2.5, 8, 4)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
scene.add(key)
const fill = new THREE.PointLight(0xff8a3d, 0.45, 18)
fill.position.set(-2, 2.2, 1)
scene.add(fill)

const root = new THREE.Group()
scene.add(root)

const floor = new THREE.Mesh(
  new THREE.BoxGeometry(6, 0.12, 10),
  new THREE.MeshStandardMaterial({ color: 0x1e2a44, roughness: 0.85, metalness: 0.05 }),
)
floor.position.set(0, -0.06, -1.5)
floor.receiveShadow = true
root.add(floor)

const lane = new THREE.Mesh(
  new THREE.BoxGeometry(2.4, 0.02, 7.5),
  new THREE.MeshStandardMaterial({ color: 0x2a3a58, roughness: 0.7 }),
)
lane.position.set(0, 0.01, -1.2)
lane.receiveShadow = true
root.add(lane)

const cabinet = new THREE.Mesh(
  new THREE.BoxGeometry(2.6, 0.9, 1.4),
  new THREE.MeshStandardMaterial({ color: 0x8b1e2d, roughness: 0.55, metalness: 0.15 }),
)
cabinet.position.set(0, 0.45, 2.0)
cabinet.castShadow = true
root.add(cabinet)

const trim = new THREE.Mesh(
  new THREE.BoxGeometry(2.65, 0.08, 1.45),
  new THREE.MeshStandardMaterial({ color: 0xf0b429, metalness: 0.4, roughness: 0.4 }),
)
trim.position.set(0, 0.92, 2.0)
root.add(trim)

const railMat = new THREE.MeshStandardMaterial({ color: 0x3a455c, roughness: 0.6 })
for (const x of [-1.35, 1.35]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 8.5), railMat)
  rail.position.set(x, 0.18, -1.5)
  root.add(rail)
}

const hoopGroup = new THREE.Group()
root.add(hoopGroup)

const backboard = new THREE.Mesh(
  new THREE.BoxGeometry(1.35, 0.9, 0.06),
  new THREE.MeshStandardMaterial({
    color: 0xf2f5ff,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  }),
)
backboard.position.set(0, 0.35, 0.12)
backboard.castShadow = true
hoopGroup.add(backboard)

const square = new THREE.Mesh(
  new THREE.PlaneGeometry(0.45, 0.35),
  new THREE.MeshBasicMaterial({ color: 0xff3b4a }),
)
square.position.set(0, 0.18, 0.155)
hoopGroup.add(square)

const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.7, roughness: 0.3 })
let rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 10, 36), rimMat)
rimMesh.rotation.x = Math.PI / 2
rimMesh.position.set(0, 0, -0.18)
rimMesh.castShadow = true
hoopGroup.add(rimMesh)

const netGroup = new THREE.Group()
hoopGroup.add(netGroup)

function rebuildNet(rimR: number) {
  while (netGroup.children.length) {
    const c = netGroup.children.pop()!
    if (c instanceof THREE.Line) c.geometry.dispose()
    netGroup.remove(c)
  }
  const netMat = new THREE.LineBasicMaterial({ color: 0xe8eefc, transparent: true, opacity: 0.55 })
  const strands = 12
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 5; k++) {
      const t = k / 5
      const rr = rimR * (1 - t * 0.55)
      const y = -t * 0.42
      const swirl = a + t * 0.55
      pts.push(new THREE.Vector3(Math.cos(swirl) * rr, y, -0.18 + Math.sin(swirl) * rr * 0.15))
    }
    netGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), netMat))
  }
}
rebuildNet(0.23)

const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.08, 2.7, 12),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.5, roughness: 0.4 }),
)
pole.position.set(0, 1.35, HOOP_HOME.z + 0.55)
pole.castShadow = true
root.add(pole)

const arm = new THREE.Mesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.7),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.5, roughness: 0.4 }),
)
arm.position.set(0, HOOP_HOME.y + 0.35, HOOP_HOME.z + 0.28)
root.add(arm)

hoopGroup.position.set(HOOP_HOME.x, HOOP_HOME.y, HOOP_HOME.z)

const ballMat = new THREE.MeshStandardMaterial({ color: 0xe4572e, roughness: 0.55, metalness: 0.05 })
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 24), ballMat)
ballMesh.castShadow = true
root.add(ballMesh)

{
  const seamMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a })
  for (const rot of [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, Math.PI / 4],
  ] as const) {
    const curve = new THREE.EllipseCurve(0, 0, BALL_R * 1.01, BALL_R * 1.01, 0, Math.PI * 2, false, 0)
    const pts3 = curve.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, 0))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), seamMat)
    line.rotation.set(rot[0], rot[1], rot[2])
    ballMesh.add(line)
  }
}

const trailMat = new THREE.LineBasicMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0 })
const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
const trailLine = new THREE.Line(trailGeo, trailMat)
root.add(trailLine)

// --- Rapier ---
const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
const eventQueue = new RAPIER.EventQueue(true)

const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.06, -1.5))
world.createCollider(RAPIER.ColliderDesc.cuboid(3, 0.06, 5).setRestitution(0.35).setFriction(0.8), floorBody)

for (const x of [-1.45, 1.45]) {
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 1.2, -1.5))
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 1.2, 4.5).setRestitution(0.4).setFriction(0.3), b)
}
const backWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.5, -5.6))
world.createCollider(RAPIER.ColliderDesc.cuboid(2, 1.8, 0.08).setRestitution(0.45), backWall)

const hoopBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(HOOP_HOME.x, HOOP_HOME.y, HOOP_HOME.z),
)

let rimHandles: number[] = []
let boardHandle = -1
let sensorHandle = -1

function quatAlignYTo(dir: THREE.Vector3): { x: number; y: number; z: number; w: number } {
  const t = dir.clone().normalize()
  if (t.lengthSq() < 1e-8) return { x: 0, y: 0, z: 0, w: 1 }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t)
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

function rebuildHoopColliders(rimR: number) {
  for (const h of rimHandles) {
    const c = world.getCollider(h)
    if (c) world.removeCollider(c, true)
  }
  rimHandles = []
  if (boardHandle >= 0) {
    const c = world.getCollider(boardHandle)
    if (c) world.removeCollider(c, true)
    boardHandle = -1
  }
  if (sensorHandle >= 0) {
    const c = world.getCollider(sensorHandle)
    if (c) world.removeCollider(c, true)
    sensorHandle = -1
  }

  const board = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.675, 0.45, 0.03)
      .setTranslation(0, 0.35, 0.12)
      .setRestitution(0.55)
      .setFriction(0.4)
      .setCollisionGroups((COL_BOARD << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  boardHandle = board.handle

  const segs = 16
  const tube = 0.018
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2
    const a1 = ((i + 1) / segs) * Math.PI * 2
    const x0 = Math.cos(a0) * rimR
    const z0 = -0.18 + Math.sin(a0) * rimR
    const x1 = Math.cos(a1) * rimR
    const z1 = -0.18 + Math.sin(a1) * rimR
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    const dx = x1 - x0
    const dz = z1 - z0
    const len = Math.hypot(dx, dz)
    const col = world.createCollider(
      RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2), tube)
        .setTranslation(mx, 0, mz)
        .setRotation(quatAlignYTo(new THREE.Vector3(dx, 0, dz)))
        .setRestitution(0.5)
        .setFriction(0.35)
        .setCollisionGroups((COL_RIM << 16) | COL_BALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      hoopBody,
    )
    rimHandles.push(col.handle)
  }

  const sensor = world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.12, rimR * 0.72)
      .setTranslation(0, -0.14, -0.18)
      .setSensor(true)
      .setCollisionGroups((COL_SENSOR << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  sensorHandle = sensor.handle

  hoopGroup.remove(rimMesh)
  rimMesh.geometry.dispose()
  rimMesh = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.02, 10, 36), rimMat)
  rimMesh.rotation.x = Math.PI / 2
  rimMesh.position.set(0, 0, -0.18)
  rimMesh.castShadow = true
  hoopGroup.add(rimMesh)
  rebuildNet(rimR)
}

rebuildHoopColliders(STAGES[0]!.rimRadius)

const ballBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(SHOOT_POS.x, SHOOT_POS.y, SHOOT_POS.z)
    .setLinearDamping(0.12)
    .setAngularDamping(0.25)
    .setCcdEnabled(true),
)
const ballCollider = world.createCollider(
  RAPIER.ColliderDesc.ball(BALL_R)
    .setRestitution(0.72)
    .setFriction(0.55)
    .setDensity(1.1)
    .setCollisionGroups((COL_BALL << 16) | 0xffff)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  ballBody,
)

type ShotFlags = {
  inFlight: boolean
  scored: boolean
  touchedRim: boolean
  spawnAt: number
}
const shot: ShotFlags = { inFlight: false, scored: false, touchedRim: false, spawnAt: 0 }

function resetBall() {
  ballBody.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  ballBody.sleep()
  shot.inFlight = false
  shot.scored = false
  shot.touchedRim = false
  shot.spawnAt = performance.now()
  ballMesh.position.copy(SHOOT_POS)
  ballMesh.quaternion.identity()
}

resetBall()

function applyHoopPose(tSec: number) {
  const st = currentStage()
  const off = hoopOffset(st.motion, tSec)
  const x = HOOP_HOME.x + off.x
  const y = HOOP_HOME.y
  const z = HOOP_HOME.z + off.z
  hoopGroup.position.set(x, y, z)
  hoopBody.setNextKinematicTranslation({ x, y, z })
}

function launchBall(dx: number, dy: number, speedPx: number) {
  if (state.phase !== 'playing' || shot.inFlight) return
  const speed = THREE.MathUtils.clamp(speedPx, MIN_FLICK, MAX_FLICK)
  const power = (speed - MIN_FLICK) / (MAX_FLICK - MIN_FLICK)

  const lateral = THREE.MathUtils.clamp(dx / 280, -1.1, 1.1)
  const lift = THREE.MathUtils.clamp(dy / 420, -0.2, 1.4)

  const impulseY = UP_BIAS + lift * 0.85 + power * 0.55
  const impulseZ = -(FORWARD_BIAS + power * 1.35 + Math.max(0, lift) * 0.25)
  const impulseX = lateral * (0.55 + power * 0.35)
  const scale = IMPULSE_SCALE * (0.85 + power * 0.55)

  ballBody.wakeUp()
  ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ballBody.applyImpulse({ x: impulseX * scale, y: impulseY * scale, z: impulseZ * scale }, true)
  ballBody.applyTorqueImpulse(
    { x: (Math.random() - 0.5) * 0.015, y: (Math.random() - 0.5) * 0.015, z: (Math.random() - 0.5) * 0.015 },
    true,
  )
  shot.inFlight = true
  shot.scored = false
  shot.touchedRim = false
  shot.spawnAt = performance.now()
  state.banner = ''
  state.bannerKind = ''
  syncHud()
}

function registerMake(swish: boolean) {
  if (shot.scored) return
  shot.scored = true
  state.streak += 1
  let pts = swish ? SCORE.swish : SCORE.make
  if (state.streak >= SCORE.streakBonusFrom) pts += SCORE.streakBonusPoints
  state.stageScore += pts
  state.totalScore += pts
  const label = swish ? `SWISH +${pts}` : `MAKE +${pts}`
  const extra = state.streak > 1 ? ` · streak ${state.streak}` : ''
  flashBanner(label + extra, 'make')
  syncHud()
  if (state.stageScore >= currentStage().goal) onStageClear()
  else window.setTimeout(() => resetBall(), 550)
}

function registerMiss() {
  if (shot.scored) return
  state.streak = 0
  flashBanner('Miss', 'miss', 900)
  syncHud()
  window.setTimeout(() => resetBall(), 400)
}

function onStageClear() {
  state.phase = 'cleared'
  state.bannerKind = 'clear'
  state.banner = `Stage ${currentStage().id} cleared!`
  syncHud()
  const next = state.stageIndex + 1
  if (next >= STAGES.length) {
    state.phase = 'won'
    showOverlay({
      eyebrow: 'Champion',
      title: 'Machine beaten!',
      body: `You cleared all ${STAGES.length} stages. Total score Σ ${state.totalScore}.`,
      button: 'Play again',
      rules: false,
    })
  } else {
    const n = STAGES[next]!
    showOverlay({
      eyebrow: `Stage ${currentStage().id} clear`,
      title: n.name,
      body: `Nice. Next up: ${n.blurb} Goal ${n.goal} in ${n.duration}s.`,
      button: 'Next stage',
      rules: false,
    })
  }
}

function onStageFail() {
  state.phase = 'failed'
  state.streak = 0
  showOverlay({
    eyebrow: 'Time up',
    title: currentStage().name,
    body: `Needed ${currentStage().goal}, scored ${state.stageScore}. Total Σ ${state.totalScore} carries over.`,
    button: 'Retry stage',
    rules: false,
  })
  syncHud()
}

function startStage(index: number, keepTotal: boolean) {
  state.stageIndex = index
  state.stageScore = 0
  state.streak = 0
  state.timeLeft = STAGES[index]!.duration
  state.phase = 'playing'
  state.banner = STAGES[index]!.blurb
  state.bannerKind = ''
  if (!keepTotal) state.totalScore = 0
  rebuildHoopColliders(STAGES[index]!.rimRadius)
  resetBall()
  hideOverlay()
  syncHud()
}

btnPrimary.addEventListener('click', () => {
  if (state.phase === 'title' || state.phase === 'won') startStage(0, false)
  else if (state.phase === 'cleared') startStage(state.stageIndex + 1, true)
  else if (state.phase === 'failed') startStage(state.stageIndex, true)
})

type PointerTrack = { id: number; x: number; y: number; samples: { x: number; y: number; t: number }[] }
let track: PointerTrack | null = null

function onPointerDown(e: PointerEvent) {
  if (state.phase !== 'playing' || shot.inFlight) return
  if (!overlayEl.classList.contains('hidden')) return
  canvas.setPointerCapture(e.pointerId)
  track = { id: e.pointerId, x: e.clientX, y: e.clientY, samples: [] }
  track.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
}

function onPointerMove(e: PointerEvent) {
  if (!track || e.pointerId !== track.id) return
  const now = performance.now()
  track.samples.push({ x: e.clientX, y: e.clientY, t: now })
  while (track.samples.length > 2 && now - track.samples[0]!.t > 120) track.samples.shift()

  const dx = e.clientX - track.x
  const dy = track.y - e.clientY
  const len = Math.hypot(dx, dy)
  if (len > 8) {
    const tip = SHOOT_POS.clone().add(new THREE.Vector3(dx * 0.004, dy * 0.004, -len * 0.003))
    trailGeo.setFromPoints([SHOOT_POS.clone(), tip])
    trailMat.opacity = 0.55
  }
}

function onPointerUp(e: PointerEvent) {
  if (!track || e.pointerId !== track.id) return
  const samples = track.samples
  track = null
  trailMat.opacity = 0
  if (samples.length < 2) return
  const a = samples[0]!
  const b = samples[samples.length - 1]!
  const dt = Math.max(16, b.t - a.t)
  const dx = b.x - a.x
  const dy = a.y - b.y
  const dist = Math.hypot(dx, dy)
  const speed = (dist / dt) * 1000
  if (dist < 24 || speed < MIN_FLICK * 0.45) return
  if (dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.2) return
  launchBall(dx, Math.max(dy, dist * 0.35), speed)
}

canvas.addEventListener('pointerdown', onPointerDown)
canvas.addEventListener('pointermove', onPointerMove)
canvas.addEventListener('pointerup', onPointerUp)
canvas.addEventListener('pointercancel', () => {
  track = null
  trailMat.opacity = 0
})

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

const camTarget = CAM_POS.clone()
const lookTarget = CAM_LOOK.clone()

function updateCamera(dt: number) {
  const hoop = hoopGroup.position
  const desiredLook = new THREE.Vector3(
    hoop.x * 0.35,
    THREE.MathUtils.lerp(CAM_LOOK.y, hoop.y, 0.35),
    THREE.MathUtils.lerp(CAM_LOOK.z, hoop.z + 0.8, 0.25),
  )
  if (shot.inFlight) {
    const bp = ballMesh.position
    desiredLook.x = THREE.MathUtils.lerp(desiredLook.x, bp.x * 0.25, 0.4)
    desiredLook.y = THREE.MathUtils.lerp(desiredLook.y, bp.y * 0.35 + 1.2, 0.35)
  }
  lookTarget.lerp(desiredLook, 1 - Math.exp(-4 * dt))
  camTarget.set(CAM_POS.x + hoop.x * 0.08, CAM_POS.y, CAM_POS.z)
  camera.position.lerp(camTarget, 1 - Math.exp(-3 * dt))
  camera.lookAt(lookTarget)
}

function processEvents() {
  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started || !shot.inFlight || shot.scored) return
    const involvesBall = h1 === ballCollider.handle || h2 === ballCollider.handle
    if (!involvesBall) return
    const other = h1 === ballCollider.handle ? h2 : h1
    if (rimHandles.includes(other)) shot.touchedRim = true
    if (other === sensorHandle) {
      const v = ballBody.linvel()
      if (v.y < 0.5) registerMake(!shot.touchedRim)
    }
  })
}

function checkMissOrScoreFallback() {
  if (!shot.inFlight || shot.scored || state.phase !== 'playing') return
  const p = ballBody.translation()
  const v = ballBody.linvel()
  const age = performance.now() - shot.spawnAt

  if (age > 200) {
    const hx = hoopGroup.position.x
    const hy = hoopGroup.position.y
    const hz = hoopGroup.position.z - 0.18
    const rimR = currentStage().rimRadius
    const radial = Math.hypot(p.x - hx, p.z - hz)
    if (v.y < 0 && p.y < hy - 0.02 && p.y > hy - 0.35 && radial < rimR * 0.78) {
      registerMake(!shot.touchedRim)
      return
    }
  }

  if (age < 700) return
  const slow = Math.hypot(v.x, v.y, v.z) < 0.35
  const onFloor = p.y < BALL_R + 0.08
  const out = p.z < -6.2 || p.z > 3.5 || Math.abs(p.x) > 2.4 || p.y < -0.5
  if ((slow && onFloor) || out || age > 5500) registerMiss()
}

let last = performance.now()
let accum = 0
const FIXED = 1 / 60

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (state.phase === 'playing') {
    state.timeLeft -= dt
    if (state.timeLeft <= 0) {
      state.timeLeft = 0
      if (!shot.inFlight || performance.now() - shot.spawnAt > 1800) onStageFail()
    }
    syncHud()
  }

  if (bannerClearAt && now > bannerClearAt && state.phase === 'playing') {
    bannerClearAt = 0
    if (state.bannerKind === 'make' || state.bannerKind === 'miss') {
      state.banner = ''
      state.bannerKind = ''
      syncHud()
    }
  }

  if (state.phase === 'playing' || state.phase === 'cleared' || state.phase === 'failed') {
    applyHoopPose(now / 1000)
  }

  accum += dt
  while (accum >= FIXED) {
    world.step(eventQueue)
    processEvents()
    accum -= FIXED
  }
  checkMissOrScoreFallback()

  const bp = ballBody.translation()
  const br = ballBody.rotation()
  ballMesh.position.set(bp.x, bp.y, bp.z)
  ballMesh.quaternion.set(br.x, br.y, br.z, br.w)

  updateCamera(dt)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

syncHud()
showOverlay({
  eyebrow: 'Arcade',
  title: 'Basketball Machine',
  body: 'Flick on the canvas to launch the ball. Make baskets before time runs out to clear each stage.',
  button: 'Start',
  rules: true,
})
requestAnimationFrame(frame)
