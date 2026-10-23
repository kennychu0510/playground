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

/** Compact arcade cabinet scale (metres). */
const BALL_R = 0.105
const GRAVITY = -12.5
/** Ready-ball rest on the front trough / shelf. */
const SHOOT_POS = new THREE.Vector3(0, 0.92, 0.95)
/** Fixed arcade POV: behind trough, looking at backboard + rim. */
const CAM_POS = new THREE.Vector3(0, 1.38, 2.15)
const CAM_LOOK = new THREE.Vector3(0, 1.55, -1.55)
const IMPULSE_SCALE = 0.72
const MIN_FLICK = 160
const MAX_FLICK = 1300
const UP_BIAS = 0.62
const FORWARD_BIAS = 0.95
const MAX_FLIGHT_BALLS = 12
const BALL_TTL_MS = 6500

const COL_RIM = 0x0001
const COL_BOARD = 0x0002
const COL_SENSOR = 0x0004
const COL_BALL = 0x0008
const COL_WORLD = 0x0010

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
  banner: 'Flick up to shoot · keep firing',
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
function flashBanner(text: string, kind: GameState['bannerKind'], ms = 1100) {
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
scene.background = new THREE.Color(0x0a1020)
scene.fog = new THREE.Fog(0x0a1020, 8, 16)

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.05, 30)
camera.position.copy(CAM_POS)
camera.lookAt(CAM_LOOK)

scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x1a2030, 0.9))
const key = new THREE.DirectionalLight(0xffffff, 1.1)
key.position.set(1.8, 6, 3)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
scene.add(key)
const fill = new THREE.PointLight(0xff8a3d, 0.55, 12)
fill.position.set(-1.4, 1.8, 0.6)
scene.add(fill)
const hoopLight = new THREE.PointLight(0xfff2c8, 0.7, 6)
hoopLight.position.set(0, 2.4, -1.6)
scene.add(hoopLight)

const root = new THREE.Group()
scene.add(root)

// Cabinet floor / deck
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(2.4, 0.1, 4.2),
  new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.85, metalness: 0.05 }),
)
floor.position.set(0, -0.05, -0.55)
floor.receiveShadow = true
root.add(floor)

// Return ramp (angled floor toward front)
const ramp = new THREE.Mesh(
  new THREE.BoxGeometry(2.1, 0.06, 2.6),
  new THREE.MeshStandardMaterial({ color: 0x243552, roughness: 0.7 }),
)
ramp.position.set(0, 0.08, -0.85)
ramp.rotation.x = -0.08
ramp.receiveShadow = true
root.add(ramp)

// Front trough / ball shelf
const trough = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.12, 0.55),
  new THREE.MeshStandardMaterial({ color: 0x8b1e2d, roughness: 0.5, metalness: 0.2 }),
)
trough.position.set(0, 0.72, 1.05)
trough.castShadow = true
root.add(trough)

const troughLip = new THREE.Mesh(
  new THREE.BoxGeometry(1.62, 0.05, 0.08),
  new THREE.MeshStandardMaterial({ color: 0xf0b429, metalness: 0.45, roughness: 0.35 }),
)
troughLip.position.set(0, 0.82, 1.28)
root.add(troughLip)

// Cabinet front body under trough
const cabinet = new THREE.Mesh(
  new THREE.BoxGeometry(2.2, 0.85, 0.7),
  new THREE.MeshStandardMaterial({ color: 0x6e1524, roughness: 0.55, metalness: 0.12 }),
)
cabinet.position.set(0, 0.35, 1.15)
cabinet.castShadow = true
root.add(cabinet)

// Side walls of the machine
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.65, metalness: 0.1 })
for (const x of [-1.15, 1.15]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 3.8), wallMat)
  wall.position.set(x, 0.95, -0.4)
  wall.castShadow = true
  root.add(wall)
}

// Back panel behind hoop
const backPanel = new THREE.Mesh(
  new THREE.BoxGeometry(2.3, 2.4, 0.1),
  new THREE.MeshStandardMaterial({ color: 0x121a2c, roughness: 0.8 }),
)
backPanel.position.set(0, 1.2, -2.55)
root.add(backPanel)

// Neon-ish side rails
const railMat = new THREE.MeshStandardMaterial({ color: 0xf0b429, metalness: 0.55, roughness: 0.35 })
for (const x of [-1.08, 1.08]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 3.6), railMat)
  rail.position.set(x, 1.82, -0.45)
  root.add(rail)
}

const hoopGroup = new THREE.Group()
root.add(hoopGroup)

const backboard = new THREE.Mesh(
  new THREE.BoxGeometry(1.15, 0.78, 0.05),
  new THREE.MeshStandardMaterial({
    color: 0xf4f7ff,
    roughness: 0.3,
    metalness: 0.05,
    transparent: true,
    opacity: 0.94,
  }),
)
backboard.position.set(0, 0.32, 0.1)
backboard.castShadow = true
hoopGroup.add(backboard)

const square = new THREE.Mesh(
  new THREE.PlaneGeometry(0.38, 0.3),
  new THREE.MeshBasicMaterial({ color: 0xff3b4a }),
)
square.position.set(0, 0.16, 0.128)
hoopGroup.add(square)

const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.75, roughness: 0.28 })
let rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 10, 36), rimMat)
rimMesh.rotation.x = Math.PI / 2
rimMesh.position.set(0, 0, -0.16)
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
  const netMat = new THREE.LineBasicMaterial({ color: 0xe8eefc, transparent: true, opacity: 0.6 })
  const strands = 12
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 5; k++) {
      const t = k / 5
      const rr = rimR * (1 - t * 0.55)
      const y = -t * 0.38
      const swirl = a + t * 0.55
      pts.push(new THREE.Vector3(Math.cos(swirl) * rr, y, -0.16 + Math.sin(swirl) * rr * 0.12))
    }
    netGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), netMat))
  }
}
rebuildNet(0.22)

// Support pole + arm (short arcade mount)
const pole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.065, 1.85, 12),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.55, roughness: 0.38 }),
)
pole.position.set(0, 0.92, HOOP_HOME.z + 0.42)
pole.castShadow = true
root.add(pole)

const arm = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.08, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.55, roughness: 0.38 }),
)
arm.position.set(0, HOOP_HOME.y + 0.3, HOOP_HOME.z + 0.22)
root.add(arm)

hoopGroup.position.set(HOOP_HOME.x, HOOP_HOME.y, HOOP_HOME.z)

const ballGeo = new THREE.SphereGeometry(BALL_R, 28, 20)
const ballMat = new THREE.MeshStandardMaterial({ color: 0xe4572e, roughness: 0.55, metalness: 0.05 })
const seamMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a })

function makeBallMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(ballGeo, ballMat)
  mesh.castShadow = true
  for (const rot of [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, Math.PI / 4],
  ] as const) {
    const curve = new THREE.EllipseCurve(0, 0, BALL_R * 1.01, BALL_R * 1.01, 0, Math.PI * 2, false, 0)
    const pts3 = curve.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), seamMat)
    line.rotation.set(rot[0], rot[1], rot[2])
    mesh.add(line)
  }
  return mesh
}

const trailMat = new THREE.LineBasicMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0 })
const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
const trailLine = new THREE.Line(trailGeo, trailMat)
root.add(trailLine)

// --- Rapier ---
const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
const eventQueue = new RAPIER.EventQueue(true)

const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.05, -0.55))
world.createCollider(
  RAPIER.ColliderDesc.cuboid(1.2, 0.05, 2.1)
    .setRestitution(0.3)
    .setFriction(0.85)
    .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
  floorBody,
)

// Ramp collider (approx)
const rampBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.fixed()
    .setTranslation(0, 0.08, -0.85)
    .setRotation({ x: Math.sin(-0.04), y: 0, z: 0, w: Math.cos(-0.04) }),
)
world.createCollider(
  RAPIER.ColliderDesc.cuboid(1.05, 0.03, 1.3)
    .setRestitution(0.25)
    .setFriction(0.7)
    .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
  rampBody,
)

// Trough shelf (balls rest here before launch)
const troughBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.72, 1.05))
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.8, 0.06, 0.28)
    .setRestitution(0.15)
    .setFriction(0.9)
    .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
  troughBody,
)

for (const x of [-1.15, 1.15]) {
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.95, -0.4))
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.05, 0.95, 1.9)
      .setRestitution(0.45)
      .setFriction(0.3)
      .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
    b,
  )
}
const backWall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.2, -2.55))
world.createCollider(
  RAPIER.ColliderDesc.cuboid(1.15, 1.2, 0.05)
    .setRestitution(0.5)
    .setCollisionGroups((COL_WORLD << 16) | COL_BALL),
  backWall,
)

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
    RAPIER.ColliderDesc.cuboid(0.575, 0.39, 0.025)
      .setTranslation(0, 0.32, 0.1)
      .setRestitution(0.55)
      .setFriction(0.4)
      .setCollisionGroups((COL_BOARD << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  boardHandle = board.handle

  const segs = 16
  const tube = 0.016
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2
    const a1 = ((i + 1) / segs) * Math.PI * 2
    const x0 = Math.cos(a0) * rimR
    const z0 = -0.16 + Math.sin(a0) * rimR
    const x1 = Math.cos(a1) * rimR
    const z1 = -0.16 + Math.sin(a1) * rimR
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
    RAPIER.ColliderDesc.cylinder(0.11, rimR * 0.7)
      .setTranslation(0, -0.13, -0.16)
      .setSensor(true)
      .setCollisionGroups((COL_SENSOR << 16) | COL_BALL)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    hoopBody,
  )
  sensorHandle = sensor.handle

  hoopGroup.remove(rimMesh)
  rimMesh.geometry.dispose()
  rimMesh = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.018, 10, 36), rimMat)
  rimMesh.rotation.x = Math.PI / 2
  rimMesh.position.set(0, 0, -0.16)
  rimMesh.castShadow = true
  hoopGroup.add(rimMesh)
  rebuildNet(rimR)
}

rebuildHoopColliders(STAGES[0]!.rimRadius)

type BallEntity = {
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  inFlight: boolean
  scored: boolean
  touchedRim: boolean
  spawnAt: number
  /** Ready ball on trough (not yet flicked). */
  ready: boolean
}

const balls: BallEntity[] = []
const ballByCollider = new Map<number, BallEntity>()

function createBallEntity(ready: boolean): BallEntity {
  const mesh = makeBallMesh()
  root.add(mesh)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(SHOOT_POS.x, SHOOT_POS.y, SHOOT_POS.z)
      .setLinearDamping(0.1)
      .setAngularDamping(0.22)
      .setCcdEnabled(true),
  )
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_R)
      .setRestitution(0.7)
      .setFriction(0.5)
      .setDensity(1.05)
      .setCollisionGroups((COL_BALL << 16) | (COL_WORLD | COL_RIM | COL_BOARD | COL_SENSOR | COL_BALL))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  )
  const ent: BallEntity = {
    mesh,
    body,
    collider,
    inFlight: false,
    scored: false,
    touchedRim: false,
    spawnAt: performance.now(),
    ready,
  }
  balls.push(ent)
  ballByCollider.set(collider.handle, ent)
  if (ready) {
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.sleep()
    mesh.position.copy(SHOOT_POS)
    mesh.quaternion.identity()
  }
  return ent
}

function destroyBall(ent: BallEntity) {
  ballByCollider.delete(ent.collider.handle)
  world.removeCollider(ent.collider, true)
  world.removeRigidBody(ent.body)
  root.remove(ent.mesh)
  // Shared geo/mat — don't dispose
  const idx = balls.indexOf(ent)
  if (idx >= 0) balls.splice(idx, 1)
}

function getReadyBall(): BallEntity | null {
  return balls.find((b) => b.ready && !b.inFlight) ?? null
}

function ensureReadyBall() {
  if (!getReadyBall()) createBallEntity(true)
}

function clearAllBalls() {
  while (balls.length) destroyBall(balls[0]!)
}

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
  if (state.phase !== 'playing') return
  let ready = getReadyBall()
  if (!ready) {
    ready = createBallEntity(true)
  }

  // Cap in-flight balls
  const flying = balls.filter((b) => b.inFlight && !b.ready).length
  if (flying >= MAX_FLIGHT_BALLS) {
    const oldest = balls.find((b) => b.inFlight && !b.ready)
    if (oldest) destroyBall(oldest)
  }

  const speed = THREE.MathUtils.clamp(speedPx, MIN_FLICK, MAX_FLICK)
  const power = (speed - MIN_FLICK) / (MAX_FLICK - MIN_FLICK)
  const lateral = THREE.MathUtils.clamp(dx / 260, -1.0, 1.0)
  const lift = THREE.MathUtils.clamp(dy / 400, -0.15, 1.35)

  const impulseY = UP_BIAS + lift * 0.8 + power * 0.48
  const impulseZ = -(FORWARD_BIAS + power * 1.05 + Math.max(0, lift) * 0.2)
  const impulseX = lateral * (0.48 + power * 0.3)
  const scale = IMPULSE_SCALE * (0.88 + power * 0.5)

  ready.ready = false
  ready.inFlight = true
  ready.scored = false
  ready.touchedRim = false
  ready.spawnAt = performance.now()

  ready.body.wakeUp()
  ready.body.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
  ready.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  ready.body.applyImpulse({ x: impulseX * scale, y: impulseY * scale, z: impulseZ * scale }, true)
  ready.body.applyTorqueImpulse(
    { x: (Math.random() - 0.5) * 0.012, y: (Math.random() - 0.5) * 0.012, z: (Math.random() - 0.5) * 0.012 },
    true,
  )

  // Immediately put next ball on the trough
  ensureReadyBall()

  state.banner = ''
  state.bannerKind = ''
  syncHud()
}

function registerMake(ent: BallEntity, swish: boolean) {
  if (ent.scored) return
  ent.scored = true
  state.streak += 1
  let pts = swish ? SCORE.swish : SCORE.make
  if (state.streak >= SCORE.streakBonusFrom) pts += SCORE.streakBonusPoints
  state.stageScore += pts
  state.totalScore += pts
  const label = swish ? `SWISH +${pts}` : `MAKE +${pts}`
  const extra = state.streak > 1 ? ` · streak ${state.streak}` : ''
  flashBanner(label + extra, 'make')
  syncHud()
  // Remove scored ball shortly after it drops through
  window.setTimeout(() => {
    if (balls.includes(ent)) destroyBall(ent)
  }, 700)
  if (state.stageScore >= currentStage().goal) onStageClear()
}

function registerMiss(ent: BallEntity, flash = true) {
  if (ent.scored) return
  if (flash) {
    state.streak = 0
    flashBanner('Miss', 'miss', 700)
    syncHud()
  }
  if (balls.includes(ent)) destroyBall(ent)
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
  clearAllBalls()
  ensureReadyBall()
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
  if (state.phase !== 'playing') return
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
    const tip = SHOOT_POS.clone().add(new THREE.Vector3(dx * 0.0035, dy * 0.0035, -len * 0.0025))
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
  if (dist < 20 || speed < MIN_FLICK * 0.4) return
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
  // Keep fixed arcade POV
  camera.position.copy(CAM_POS)
  camera.lookAt(CAM_LOOK)
})

function processEvents() {
  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return
    const b1 = ballByCollider.get(h1)
    const b2 = ballByCollider.get(h2)
    const ent = b1 ?? b2
    if (!ent || !ent.inFlight || ent.scored || ent.ready) return
    const other = b1 ? h2 : h1
    if (rimHandles.includes(other)) ent.touchedRim = true
    if (other === sensorHandle) {
      const v = ent.body.linvel()
      if (v.y < 0.55) registerMake(ent, !ent.touchedRim)
    }
  })
}

function checkBallsFallback() {
  if (state.phase !== 'playing' && state.phase !== 'cleared' && state.phase !== 'failed') return
  const now = performance.now()
  const rimR = currentStage().rimRadius
  const hx = hoopGroup.position.x
  const hy = hoopGroup.position.y
  const hz = hoopGroup.position.z - 0.16

  // Copy list — we may destroy while iterating
  for (const ent of [...balls]) {
    if (ent.ready || !ent.inFlight) continue
    const p = ent.body.translation()
    const v = ent.body.linvel()
    const age = now - ent.spawnAt

    if (!ent.scored && age > 180) {
      const radial = Math.hypot(p.x - hx, p.z - hz)
      if (v.y < 0 && p.y < hy - 0.02 && p.y > hy - 0.32 && radial < rimR * 0.75) {
        registerMake(ent, !ent.touchedRim)
        continue
      }
    }

    if (ent.scored) continue
    if (age < 600) continue
    const slow = Math.hypot(v.x, v.y, v.z) < 0.3
    const onFloor = p.y < BALL_R + 0.12
    const out = p.z < -3.2 || p.z > 2.2 || Math.abs(p.x) > 1.5 || p.y < -0.4
    if ((slow && onFloor) || out || age > BALL_TTL_MS) {
      registerMiss(ent, age > 800 && !out ? true : age > 900)
    }
  }
}

ensureReadyBall()

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
      const anyRecent = balls.some((b) => b.inFlight && now - b.spawnAt < 1800)
      if (!anyRecent) onStageFail()
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

  // Keep ready ball glued to trough
  const ready = getReadyBall()
  if (ready) {
    ready.body.setTranslation({ x: SHOOT_POS.x, y: SHOOT_POS.y, z: SHOOT_POS.z }, true)
    ready.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    ready.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    if (!ready.body.isSleeping()) ready.body.sleep()
  }

  accum += dt
  while (accum >= FIXED) {
    world.step(eventQueue)
    processEvents()
    accum -= FIXED
  }
  checkBallsFallback()

  for (const ent of balls) {
    const bp = ent.body.translation()
    const br = ent.body.rotation()
    if (ent.ready) {
      ent.mesh.position.copy(SHOOT_POS)
      ent.mesh.quaternion.identity()
    } else {
      ent.mesh.position.set(bp.x, bp.y, bp.z)
      ent.mesh.quaternion.set(br.x, br.y, br.z, br.w)
    }
  }

  // Fixed camera — never follow ball or orbit
  camera.position.copy(CAM_POS)
  camera.lookAt(CAM_LOOK)

  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}

syncHud()
showOverlay({
  eyebrow: 'Arcade',
  title: 'Basketball Machine',
  body: 'Flick on the canvas to launch balls. Keep firing — multiple balls in the air. Clear each stage before time runs out.',
  button: 'Start',
  rules: true,
})
requestAnimationFrame(frame)
